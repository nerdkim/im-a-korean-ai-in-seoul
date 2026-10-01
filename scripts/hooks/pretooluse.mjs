#!/usr/bin/env node
/* 도구를 실행하기 직전에 문체 위반을 막는 hook입니다. */
import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isEntryPoint, projectRoot, rulesDocPath, toolRoot } from '../lib/paths.mjs';
import { loadRules } from '../lib/rules.mjs';
import { checkText, checkToolCall, formatToolViolations, formatViolations, blockingViolations } from '../lib/check.mjs';
import { koreanCommentsOf } from '../lib/comments.mjs';
import { targetForPath, toProjectRelative } from '../lib/targets.mjs';
import { stripCode } from '../lib/text.mjs';

const PROJECT_ROOT = projectRoot();
const RULES_DOC = rulesDocPath(PROJECT_ROOT);

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/* 검토 후보를 한 번에 몇 건까지 알릴지 정합니다. 많으면 정작 고칠 것이 묻힙니다. */
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
    /* 두 경로 모두 `String.replace`를 쓰지 않습니다. 바꿀 문자열의 달러 기호를 치환 패턴으로 읽지 않기 위해서입니다. */
    if (edit.replace_all === true) {
      text = text.split(from).join(to);
      continue;
    }
    const at = text.indexOf(from);
    text = text.slice(0, at) + to + text.slice(at + from.length);
  }
  return text;
}

/* 지금 디스크에 있는 파일 내용입니다. 새 파일이면 빈 문자열입니다. */
function currentText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/* 검사할 산문만 남긴 글입니다. 주석 밖과 code block을 공백으로 덮으므로 줄 수는 그대로입니다. */
function proseLinesOf(text, target, path) {
  const normalized = text.normalize('NFC');
  const prose = target === 'comment' ? koreanCommentsOf(normalized, path) : normalized;
  return stripCode(prose).split('\n');
}

/* 앞뒤로 같은 줄을 뺀 나머지가 바뀐 줄입니다. 들여쓰기나 줄 끝 공백만 다른 줄은 같은 줄로 봅니다. */
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

/* 범위를 둘러싼 문단만 남기고 나머지 줄은 비웁니다. 줄 번호는 파일 그대로입니다. */
function paragraphsAround(lines, from, to) {
  if (from >= to) return '';
  let start = from;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
  let end = to;
  while (end < lines.length && lines[end].trim() !== '') end += 1;
  return lines.map((line, i) => (i >= start && i < end ? line : '')).join('\n');
}

/*
 * 이번 호출로 바뀐 문단에만 있는 검토 후보입니다.
 * 파일 전체에서 주석 밖의 코드와 code block을 먼저 공백으로 가린 뒤 비교하므로 편집 조각에 주석 표시나 fence가 없어도 판정이 같습니다.
 * 같은 규칙에 걸린 같은 표현이 바뀌기 전 문단에도 있으면 알리지 않습니다.
 */
export function reviewNotes(before, after, rules, target, path) {
  const wanted = new Set(rules.reviewRules ?? []);
  if (wanted.size === 0) return [];
  const beforeLines = proseLinesOf(before, target, path);
  const afterLines = proseLinesOf(after, target, path);
  const { head, beforeEnd, afterEnd } = changedRange(beforeLines, afterLines);
  /* 주석 밖의 코드와 code block은 이미 가렸으므로 남은 글을 문서로 검사합니다. */
  const pick = (text) => checkText(text, rules, 'doc').filter((v) => v.severity === 'warning' && wanted.has(v.rule));
  const added = pick(paragraphsAround(afterLines, head, afterEnd));
  if (added.length === 0) return [];
  const seen = new Set(pick(paragraphsAround(beforeLines, head, beforeEnd)).map((v) => `${v.rule}\n${v.detail}`));
  return added.filter((v) => !seen.has(`${v.rule}\n${v.detail}`));
}

/* shell에 그대로 붙여 넣을 수 있게 경로를 감쌉니다. */
const shellQuote = (s) => (/^[\w./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);

export function formatReviewNotes(notes, where, checker = 'check-korean.mjs') {
  const shown = notes.slice(0, MAX_REVIEW_NOTES);
  const head =
    `한국어 검토 후보 ${notes.length}건 (${where}). 쓰기는 막지 않았습니다. ` +
    '어색한 표현이면 고치고, 문맥에 맞으면 그대로 두십시오. 검토 결과는 답변에 적지 마십시오.';
  const body = shown.map((v) => `  [${v.rule}] ${v.line}줄: ${v.detail}`);
  const rest = notes.length > shown.length
    ? [`  나머지 ${notes.length - shown.length}건은 \`node ${shellQuote(checker)} --file ${shellQuote(where)}\` 명령으로 확인하십시오.`]
    : [];
  return [head, ...body, ...rest].join('\n');
}

/* `git commit` 명령에서 메시지를 모두 뽑아냅니다. */
export function commitMessagesIn(command) {
  if (typeof command !== 'string' || !/\bgit\b[^\n]*\bcommit\b/.test(command)) return [];
  const out = [];
  /* 큰따옴표, 작은따옴표, 따옴표 없는 한 낱말을 잡습니다. */
  const re = /(?:-m|--message=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/g;
  for (const m of command.matchAll(re)) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    /* shell이 풀어 낼 이스케이프를 여기서도 풉니다. */
    const unescaped = value.replace(/\\(["'\\$`])/g, '$1').replace(/\\n/g, '\n');
    if (unescaped.trim().length > 0) out.push(unescaped);
  }
  return out;
}

/* heredoc 본문을 지웁니다. */
function stripHeredocBodies(command) {
  return command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, '<<$2');
}

/* shell 명령이 쓸 검사 대상 파일 경로를 찾습니다. */
export function shellWritePaths(command, rules, projectRoot, cwd) {
  if (typeof command !== 'string' || command.length === 0) return [];
  const text = stripHeredocBodies(command);
  const candidates = new Set();

  /* 1) 방향 재지정입니다. */
  for (const m of text.matchAll(/(?:^|[\s;&|(])\d?>>?\s*(?!&)(['"]?)([^\s;&|()<>'"]+)\1/g)) {
    candidates.add(m[2]);
  }

  /* 2) `tee`입니다. */
  for (const m of text.matchAll(/\btee\b((?:\s+-{1,2}[A-Za-z-]+)*)\s+(['"]?)([^\s;&|()<>'"]+)\2/g)) {
    candidates.add(m[3]);
  }

  /* 3) 제자리 편집입니다. */
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
    /* shell이 확장할 문자가 남아 있으면 판정하지 않습니다. */
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

/* 막지 않고 Claude에게만 알립니다. 권한 결정을 내리지 않으므로 사용자 승인 절차는 그대로입니다. */
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

  /* 1) 사람이 읽을 산문을 담는 도구입니다. */
  if (rules.chatToolFields.has(toolName)) {
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

  /* 3) 커밋 메시지입니다. */
  if (toolName === 'Bash') {
    const problems = [];
    for (const message of commitMessagesIn(ti.command)) {
      problems.push(...blockingViolations(checkText(message, rules, 'commit')));
    }
    if (problems.length > 0) deny(formatViolations(problems, rules, '커밋 메시지'));

    /* shell 명령으로 쓰는 파일입니다. */
    const writes = shellWritePaths(ti.command, rules, PROJECT_ROOT, input.cwd);
    if (writes.length > 0) {
      deny(
        `shell 명령으로 검사 대상 파일에 쓰려 했습니다: ${writes.join(', ')}\n\n` +
          'shell 명령으로 쓰는 내용은 문체 검사를 받지 않습니다. 명령이 무엇을 쓸지 이 hook이 미리 알 수 없기 때문입니다.\n' +
          'Write 또는 Edit 도구로 같은 일을 하십시오. 두 도구로 쓰는 내용은 쓰기 직전에 검사합니다.\n' +
          `검사 대상이 아닌 경로에 쓰는 것은 막지 않습니다. 무엇이 대상인지는 확장자와 규칙 문서(${RULES_DOC})의 경로 패턴으로 정합니다.`,
      );
    }
    process.exit(0);
  }

  /* 4) 파일 쓰기입니다. */
  if (!FILE_TOOLS.has(toolName)) process.exit(0);
  const filePath = ti.file_path ?? ti.notebook_path ?? '';
  if (filePath.length === 0) process.exit(0);

  /* 프로젝트 밖의 파일은 판정하지 않습니다. */
  const rel = toProjectRelative(filePath, PROJECT_ROOT);
  if (rel === null) process.exit(0);

  const target = targetForPath(rel, rules);
  if (target === null) process.exit(0);

  const after = resultOfEdit(toolName, ti, filePath);
  const violations = blockingViolations(checkText(after, rules, target, { path: rel }));
  if (violations.length > 0) deny(formatViolations(violations, rules, `${rel} (${target})`));

  /* 오류가 없으면 이번에 바뀐 문단의 경고만 검토 후보로 알립니다. 노트북 셀은 바뀌기 전 내용과 비교하지 않습니다. */
  const before = toolName === 'NotebookEdit' ? '' : currentText(filePath);
  const notes = reviewNotes(before, after, rules, target, rel);
  if (notes.length > 0) {
    /* 설치한 프로젝트에서는 `.korean-style/scripts/check-korean.mjs`가 됩니다. */
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
