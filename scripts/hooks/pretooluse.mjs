#!/usr/bin/env node
/* 도구를 실행하기 직전에 문체 위반을 막는 hook입니다. */
import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isEntryPoint, projectRoot, rulesDocPath, toolRoot } from '../lib/paths.mjs';
import { loadRules } from '../lib/rules.mjs';
import { checkText, checkToolCall, formatToolViolations, formatViolations, blockingViolations, toolFieldTexts } from '../lib/check.mjs';
import { koreanCommentsOf } from '../lib/comments.mjs';
import { targetForPath, toProjectRelative } from '../lib/targets.mjs';
import { blankQuoteRegions, stripCode } from '../lib/text.mjs';
import { needsSkill, needsWriter, skillRequest, writerRequest } from '../lib/skill.mjs';

const PROJECT_ROOT = projectRoot();
const RULES_DOC = rulesDocPath(PROJECT_ROOT);

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/* Claude에게 한 번에 보여 주는 경고는 이 건수까지입니다. 많으면 정작 고칠 것이 묻힙니다. */
const MAX_REVIEW_NOTES = 5;

/* 편집을 적용한 뒤의 파일 내용을 돌려줍니다. */
export function resultOfEdit(toolName, toolInput, filePath) {
  if (toolName === 'Write') return toolInput.content ?? '';
  if (toolName === 'NotebookEdit') return toolInput.new_source ?? '';

  let current;
  try {
    current = readFileSync(filePath, 'utf-8');
  } catch {
    return toolInput.new_string ?? '';
  }

  const edits =
    toolName === 'MultiEdit' && Array.isArray(toolInput.edits)
      ? toolInput.edits
      : [{ old_string: toolInput.old_string, new_string: toolInput.new_string, replace_all: toolInput.replace_all }];

  let text = current;
  for (const edit of edits) {
    const from = edit.old_string ?? '';
    const to = edit.new_string ?? '';
    if (from === '' || !text.includes(from)) return to;
    /* `replace_all`이든 아니든 `String.replace`는 쓰지 않습니다. `String.replace`는 새 문자열의 달러 기호를 치환 패턴으로 해석하기 때문입니다. */
    if (edit.replace_all === true) {
      text = text.split(from).join(to);
      continue;
    }
    const at = text.indexOf(from);
    text = text.slice(0, at) + to + text.slice(at + from.length);
  }
  return text;
}

/* 이번 도구 호출로 파일에 새로 쓰는 글입니다. */
export function writtenText(toolName, toolInput) {
  if (toolName === 'Write') return toolInput.content ?? '';
  if (toolName === 'NotebookEdit') return toolInput.new_source ?? '';
  if (toolName === 'MultiEdit' && Array.isArray(toolInput.edits)) return toolInput.edits.map((edit) => edit.new_string ?? '').join('\n');
  return toolInput.new_string ?? '';
}

/* 지금 디스크에 있는 파일 내용입니다. 새 파일이면 빈 문자열입니다. */
function currentText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/* 검사할 산문만 남긴 글입니다. 소스 파일에서는 주석 밖을, 문서에서는 인용 구간을 공백으로 바꾸고 어느 쪽이든 코드 블록과 인라인 코드도 공백으로 바꿉니다. 줄을 지우지 않으므로 줄 수는 그대로입니다. */
function proseLinesOf(text, target, path, rules) {
  const normalized = text.normalize('NFC');
  if (target === 'comment') return stripCode(koreanCommentsOf(normalized, path)).split('\n');
  const prose = target === 'doc' ? blankQuoteRegions(normalized, rules.quoteMarker) : normalized;
  return stripCode(prose).split('\n');
}

/* 편집 전과 후의 글에서 처음과 끝부터 같은 줄을 걷어 내고 남은 줄을 바뀐 줄로 봅니다. 들여쓰기나 줄 끝 공백만 다른 줄은 같은 줄로 봅니다. */
function changedRange(beforeLines, afterLines) {
  const same = (i, j) => beforeLines[i].trim() === afterLines[j].trim();
  let head = 0;
  while (head < beforeLines.length && head < afterLines.length && same(head, head)) head += 1;
  let tail = 0;
  while (
    tail < beforeLines.length - head &&
    tail < afterLines.length - head &&
    same(beforeLines.length - 1 - tail, afterLines.length - 1 - tail)
  ) tail += 1;
  return { head, beforeEnd: beforeLines.length - tail, afterEnd: afterLines.length - tail };
}

/* `from`부터 `to` 앞까지의 줄이 든 문단만 남기고 나머지 줄은 비웁니다. 줄 번호는 파일 그대로입니다. */
function paragraphsAround(lines, from, to) {
  if (from >= to) return '';
  let start = from;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
  let end = to;
  while (end < lines.length && lines[end].trim() !== '') end += 1;
  return lines.map((line, i) => (i >= start && i < end ? line : '')).join('\n');
}

/*
 * 이번 편집으로 바뀐 문단에 새로 생긴 경고를 찾아 그 가운데 review-rules에 든 규칙의 경고만 돌려줍니다.
 * 비교하기 전에 파일 전체에서 가릴 곳을 공백으로 바꿉니다. 소스 파일이면 주석 밖의 코드를, 문서면 인용 구간을 가리고 어느 쪽이든 코드 블록도 가립니다.
 * 그래서 고친 부분에 주석 표시나 코드 블록을 여닫는 줄이 없어도 주석 안의 글은 검사하고 코드 블록 안의 글은 건너뜁니다.
 * 같은 규칙에 걸린 같은 표현이 바뀌기 전 문단에도 있으면 알리지 않습니다.
 */
export function reviewNotes(before, after, rules, target, path) {
  const wanted = new Set(rules.reviewRules ?? []);
  if (wanted.size === 0) return [];
  const beforeLines = proseLinesOf(before, target, path, rules);
  const afterLines = proseLinesOf(after, target, path, rules);
  const { head, beforeEnd, afterEnd } = changedRange(beforeLines, afterLines);
  /* 주석 밖의 코드와 코드 블록은 이미 가렸으므로 남은 글은 문서(`doc`) 규칙으로 검사합니다. */
  const pick = (text) => checkText(text, rules, 'doc').filter((v) => v.severity === 'warning' && wanted.has(v.rule));
  const added = pick(paragraphsAround(afterLines, head, afterEnd));
  if (added.length === 0) return [];
  const seen = new Set(pick(paragraphsAround(beforeLines, head, beforeEnd)).map((v) => `${v.rule}\n${v.detail}`));
  return added.filter((v) => !seen.has(`${v.rule}\n${v.detail}`));
}

/* shell에 그대로 붙여 넣을 수 있게 필요하면 경로를 작은따옴표로 감쌉니다. */
const shellQuote = (s) => (/^[\w./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);

export function formatReviewNotes(notes, where, checker = 'check-korean.mjs') {
  const shown = notes.slice(0, MAX_REVIEW_NOTES);
  const head =
    `한국어 검사: 이번에 ${where}에 쓴 문단에서 경고 ${notes.length}건이 나왔습니다. 파일 쓰기는 막지 않았습니다. ` +
    '어색한 표현이면 고치고 문맥에 맞으면 그대로 두십시오. 고쳤는지 그대로 두었는지는 답변에 적지 마십시오.';
  const body = shown.map((v) => `  [${v.rule}] ${v.line}줄: ${v.detail}`);
  const rest = notes.length > shown.length
    ? [`  나머지 ${notes.length - shown.length}건은 \`node ${shellQuote(checker)} --file ${shellQuote(where)}\` 명령으로 확인하십시오.`]
    : [];
  return [head, ...body, ...rest].join('\n');
}

/* heredoc을 여는 표시입니다. 끝을 알리는 이름은 두 번째 캡처 그룹에 담깁니다. */
const HEREDOC_OPEN = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1/y;

/* `from`부터 heredoc 본문을 차례로 건너뛰고 마지막 본문을 닫는 줄의 끝 위치를 돌려줍니다. */
function skipHeredocBodies(command, from, names) {
  let at = from;
  while (names.length > 0) {
    const end = new RegExp(`^[\\t ]*${names.shift()}[\\t ]*$`, 'm').exec(command.slice(at));
    if (end === null) return command.length;
    at += end.index + end[0].length;
  }
  return at;
}

/*
 * Bash 명령을 따옴표 밖의 `&&`, `||`, `;`, `|`, 줄바꿈에서 명령 단위로 나눕니다.
 * 따옴표 안과 heredoc 본문에서는 나누지 않습니다. 그래서 echo로 출력하는 글이나 heredoc으로 파일에 쓰는 글 속의 명령은 실제로 실행하는 명령으로 보지 않습니다.
 */
export function commandSegments(command) {
  if (typeof command !== 'string') return [];
  const out = [];
  const pending = [];
  let quote = null;
  let start = 0;
  const cut = (end, next) => {
    if (command.slice(start, end).trim().length > 0) out.push(command.slice(start, end));
    start = next;
  };
  let i = 0;
  while (i < command.length) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      i += 1;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '\n' && pending.length > 0) {
      i = skipHeredocBodies(command, i + 1, pending);
      continue;
    }
    HEREDOC_OPEN.lastIndex = i;
    const open = c === '<' ? HEREDOC_OPEN.exec(command) : null;
    if (open !== null) {
      pending.push(open[2]);
      i += open[0].length;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === '\n' || c === ';') cut(i, i + 1);
    else if (c === '&' && command[i + 1] === '&') {
      cut(i, i + 2);
      i += 1;
    } else if (c === '|') {
      const width = command[i + 1] === '|' ? 2 : 1;
      cut(i, i + width);
      i += width - 1;
    }
    i += 1;
  }
  cut(command.length, command.length);
  return out;
}

/*
 * 옵션 하나의 값입니다. Claude Code는 여러 줄 메시지를 `"$(cat <<'EOF' ... EOF\n)"`로 넘깁니다. 이 형태에서는 heredoc 본문을 값으로 읽습니다.
 * 그 밖에는 ANSI-C 따옴표(`$'...'`), 큰따옴표, 작은따옴표로 감싼 값과 따옴표 없이 쓴 낱말 하나를 읽습니다.
 * 들여쓰기와 줄 끝 공백은 `[\t ]`로만 잡습니다. `\s`처럼 줄바꿈까지 잡으면 닫히지 않은 heredoc에서 백트래킹이 크게 늘어납니다.
 */
const OPTION_VALUE = String.raw`(?:"\$\(cat[ \t]+<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n([\s\S]*?)\n[\t ]*\2[\t ]*(?:\n[\t ]*)?\)"|\$'((?:[^'\\]|\\[\s\S])*)'|"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'|(\S+))`;

/* ANSI-C 따옴표 안의 이스케이프를 풉니다. */
const unescapeAnsiC = (s) => s.replace(/\\(.)/gs, (_, ch) => ({ n: '\n', t: '\t' })[ch] ?? ch);

/* 큰따옴표로 감싼 값이나 따옴표 없이 쓴 값에서 shell이 풀었을 이스케이프를 풉니다. 백슬래시로 이은 줄은 붙이고 글자 그대로 쓴 `\n`도 줄바꿈으로 바꿉니다. */
const unescapeShell = (s) => s.replace(/\\\n/g, '').replace(/\\(["'\\$`])/g, '$1').replace(/\\n/g, '\n');

/*
 * 명령 하나에서 옵션 값을 모두 뽑습니다. 짧은 옵션은 `-m메시지`처럼 값을 붙여 써도 읽습니다.
 * 긴 옵션은 이름 뒤에 `=`, 공백, 따옴표, `$`가 올 때만 읽습니다. 그래야 `--body-file`처럼 `--body`로 시작하는 다른 옵션을 `--body`로 잘못 읽지 않습니다.
 */
function optionValues(segment, { short, long }) {
  const re = new RegExp(String.raw`(?:^|\s)(?:${short}|(?:${long})(?=[=\s"'$]))(?:=|[ \t]*)${OPTION_VALUE}`, 'g');
  const out = [];
  for (const m of segment.matchAll(re)) {
    const value = m[3] ?? (m[4] !== undefined ? unescapeAnsiC(m[4]) : m[6] ?? unescapeShell(m[5] ?? m[7] ?? ''));
    if (value.trim().length > 0) out.push(value);
  }
  return out;
}

/* `-F -`나 `--body-file -`처럼 표준 입력으로 받은 글이면 명령에 딸린 heredoc 본문을 돌려줍니다. */
function stdinBodies(segment) {
  if (!/(?:^|\s)(?:-F|--file|--body-file)(?:[ \t]+|=)-(?=\s|$)/.test(segment)) return [];
  const bodies = [];
  for (const m of segment.matchAll(/<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n([\s\S]*?)\n[\t ]*\2[\t ]*(?:\n|$)/g)) {
    if (m[3].trim().length > 0) bodies.push(m[3]);
  }
  return bodies;
}

/* `git commit` 명령입니다. `git -C <경로> commit`처럼 git 전역 옵션을 앞에 둔 형태도 봅니다. */
const GIT_COMMIT = /^\s*(?:\w+=\S*\s+)*git(?:\s+(?:-[Cc]\s+\S+|--[\w-]+(?:=\S+)?|-[A-Za-z]+))*\s+commit\b/;

/* PR과 이슈에 글을 올리는 `gh` 명령입니다. `new`는 `create`의 별칭입니다. `merge`는 병합 커밋의 제목과 본문을 받습니다. */
const GH_POST = /^\s*(?:\w+=\S*\s+)*gh\s+(?:pr|issue)\s+(?:create|new|edit|comment|review|merge)\b/;

/* `git commit` 명령에서 메시지를 모두 뽑습니다. `-am`처럼 다른 옵션과 붙여 쓴 `-m`, `--trailer` 값, 표준 입력으로 넘긴 메시지도 봅니다. */
export function commitMessagesIn(command) {
  return commandSegments(command)
    .filter((segment) => GIT_COMMIT.test(segment))
    .flatMap((segment) => [...optionValues(segment, { short: '-[A-Za-z]*m', long: '--message|--trailer' }), ...stdinBodies(segment)]);
}

/* `gh` 명령으로 PR이나 이슈에 올리는 제목, 설명, 코멘트를 뽑습니다. `--body-file`로 넘긴 파일은 읽지 않습니다. */
export function pullRequestTextsIn(command) {
  return commandSegments(command)
    .filter((segment) => GH_POST.test(segment))
    .flatMap((segment) => [...optionValues(segment, { short: '-[tb]', long: '--title|--body|--subject' }), ...stdinBodies(segment)]);
}

/* heredoc 본문을 지웁니다. */
function stripHeredocBodies(command) {
  return command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, '<<$2');
}

/* shell 명령이 쓰려는 파일 가운데 검사하는 파일의 경로를 찾습니다. */
export function shellWritePaths(command, rules, projectRoot, cwd) {
  if (typeof command !== 'string' || command.length === 0) return [];
  const text = stripHeredocBodies(command);
  const candidates = new Set();

  /* 1) `>`, `>>` redirection입니다. */
  for (const m of text.matchAll(/(?:^|[\s;&|(])\d?>>?\s*(?!&)(['"]?)([^\s;&|()<>'"]+)\1/g)) {
    candidates.add(m[2]);
  }

  /* 2) `tee`입니다. */
  for (const m of text.matchAll(/\btee\b((?:\s+-{1,2}[A-Za-z-]+)*)\s+(['"]?)([^\s;&|()<>'"]+)\2/g)) {
    candidates.add(m[3]);
  }

  /* 3) `sed -i`, `perl -i`처럼 파일을 바로 고치는 명령입니다. */
  for (const m of text.matchAll(/\b(?:sed|perl)\b([^;&|]*)/g)) {
    const rest = m[1] ?? '';
    if (!/(?:^|\s)-i/.test(rest)) continue;
    for (const token of rest.split(/\s+/)) {
      if (token.length === 0 || token.startsWith('-')) continue;
      candidates.add(token.replace(/^['"]|['"]$/g, ''));
    }
  }

  const out = [];
  for (const raw of candidates) {
    if (raw.length === 0) continue;
    /* shell이 확장할 문자가 남아 있으면 건너뜁니다. */
    if (/[$`~*?]/.test(raw)) continue;
    const rel = toProjectRelative(resolve(cwd ?? projectRoot, raw), projectRoot);
    if (rel === null) continue;
    if (targetForPath(rel, rules) === null) continue;
    out.push(rel);
  }
  return out;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

/* 도구 호출을 막지 않고 Claude에게 내용을 전하기만 합니다. `permissionDecision`을 넣지 않으므로 사용자 승인 절차는 그대로입니다. */
function note(context) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: context,
      },
    }),
  );
  process.exit(0);
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function run() {
  let input;
  try {
    input = JSON.parse(readStdin());
  } catch {
    process.exit(0);
  }
  const toolName = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  const rules = loadRules(RULES_DOC);

  /*
   * Claude가 이번 요청에서 한국어를 쓰기 전에 skill을 불렀는지 봅니다.
   * `writerText`를 주면 그 글의 한글이 기준 이상일 때 작성 agent에게 맡겼는지 먼저 봅니다. 질문과 계획처럼 대화에 쓰는 글에는 주지 않습니다.
   */
  const requireSkill = (text, retry, writerText = null) => {
    const context = { text, rules, projectRoot: PROJECT_ROOT, transcriptPath: input.transcript_path, agentId: input.agent_id };
    if (writerText !== null && needsWriter({ ...context, text: writerText })) {
      deny(writerRequest(rules.writerAgent, rules.writerAgentMinHangul, retry));
    }
    if (needsSkill(context)) deny(skillRequest(rules.writingSkill, retry));
  };

  /* 1) 사람이 읽을 산문을 담는 도구입니다. */
  if (rules.chatToolFields.has(toolName)) {
    requireSkill(toolFieldTexts(toolName, ti, rules).map((field) => field.text).join('\n'), '다시 시도하십시오.');
    const problems = blockingViolations(checkToolCall(toolName, ti, rules));
    if (problems.length === 0) process.exit(0);
    deny(formatToolViolations(problems, rules));
  }

  /* 2) agent가 읽을 산문을 담는 도구입니다. */
  if (rules.agentToolFields.has(toolName)) {
    const problems = blockingViolations(checkToolCall(toolName, ti, rules, 'doc'));
    if (problems.length === 0) process.exit(0);
    deny(formatToolViolations(problems, rules));
  }

  /* 3) `git commit`으로 남기는 커밋 메시지와 `gh`로 PR이나 이슈에 올리는 글입니다. */
  if (toolName === 'Bash') {
    const messages = commitMessagesIn(ti.command);
    const posts = pullRequestTextsIn(ti.command);
    const posted = [...messages, ...posts].join('\n');
    requireSkill(posted, messages.length > 0 ? '다시 커밋하십시오.' : '명령을 다시 실행하십시오.', posted);
    for (const [texts, where] of [[messages, '커밋 메시지'], [posts, 'PR이나 이슈에 올릴 글']]) {
      const problems = texts.flatMap((text) => blockingViolations(checkText(text, rules, 'commit')));
      if (problems.length > 0) deny(formatViolations(problems, rules, where));
    }

    /* shell 명령으로 쓰는 파일입니다. */
    const writes = shellWritePaths(ti.command, rules, PROJECT_ROOT, input.cwd);
    if (writes.length > 0) {
      deny(
        `shell 명령으로 검사 대상 파일에 쓰려 했습니다: ${writes.join(', ')}\n\n` +
          '이 hook은 shell 명령이 무엇을 쓸지 미리 알 수 없어서 쓰려는 글을 검사하지 못합니다.\n' +
          'Write 또는 Edit 도구로 같은 일을 하십시오. 두 도구로 쓰는 내용은 쓰기 직전에 검사합니다.\n' +
          `검사하지 않는 경로에는 shell 명령으로 써도 됩니다. 어떤 파일을 검사할지는 확장자와 규칙 문서(${RULES_DOC})에 적힌 경로 패턴으로 정합니다.`,
      );
    }
    process.exit(0);
  }

  /* 4) 파일 쓰기입니다. */
  if (!FILE_TOOLS.has(toolName)) process.exit(0);
  const filePath = ti.file_path ?? ti.notebook_path ?? '';
  if (filePath.length === 0) process.exit(0);

  /* 프로젝트 밖의 파일은 검사하지 않습니다. */
  const rel = toProjectRelative(filePath, PROJECT_ROOT);
  if (rel === null) process.exit(0);

  const target = targetForPath(rel, rules);
  if (target === null) process.exit(0);
  /* 작성 agent는 코드를 쓰지 않습니다. 그래서 소스 파일에서는 주석의 한글만 세어 작성 agent를 요구할지 정합니다. */
  const written = writtenText(toolName, ti);
  requireSkill(written, '다시 쓰십시오.', target === 'comment' ? koreanCommentsOf(written, rel) : written);

  const after = resultOfEdit(toolName, ti, filePath);
  const violations = blockingViolations(checkText(after, rules, target, { path: rel }));
  if (violations.length > 0) deny(formatViolations(violations, rules, `${rel}, --target ${target}`));

  /* 오류가 없으면 이번에 바뀐 문단에 새로 생긴 경고를 찾습니다. 그 가운데 review-rules에 든 규칙의 경고만 Claude에게 알립니다. NotebookEdit 도구로 셀을 고칠 때는 바뀌기 전 셀과 비교하지 않습니다. */
  const before = toolName === 'NotebookEdit' ? '' : currentText(filePath);
  const notes = reviewNotes(before, after, rules, target, rel);
  if (notes.length > 0) {
    /* 검사기 경로는 설치한 프로젝트에서 `.korean-style/scripts/check-korean.mjs`가 됩니다. */
    const checker = relative(PROJECT_ROOT, join(toolRoot(), 'scripts', 'check-korean.mjs')).split(sep).join('/');
    note(formatReviewNotes(notes, rel, checker));
  }
  process.exit(0);
}

/* 직접 실행할 때만 동작합니다. */
const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) {
  try {
    run();
  } catch {
    /* 예외가 나면 통과시킵니다. */
    process.exit(0);
  }
}
