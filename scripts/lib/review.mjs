/* 검토 모델이 한국어 글의 어색한 표현을 찾게 합니다. 검토 모델에게는 Claude가 요청 하나에서 쓴 한국어만 따로 보냅니다. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { commitMessagesIn, pullRequestTextsIn } from '../hooks/pretooluse.mjs';
import { hangulCount } from './skill.mjs';
import { matchesAny, toProjectRelative } from './targets.mjs';

/* 검토 모델에게 시스템 프롬프트로 주는 지시입니다. */
export const REVIEWER_PROMPT = [
  '사용자가 보낸 글은 AI가 이번 작업에서 쓴 한국어입니다. 파일, 커밋 메시지, PR이나 이슈에 올린 글, 답변처럼 쓴 곳마다 `[이름]` 줄로 나눠 두었고 파일에서 가져온 줄 앞에는 줄 번호를 붙였습니다.',
  'AI는 영어로 구상한 내용을 한국어로 옮겨 쓰는 일이 많아서 낱말 하나하나는 맞는데 한국 사람이라면 그 문맥에서 쓰지 않을 말이 섞입니다. 줄을 하나도 건너뛰지 말고 문장마다 따지십시오. 한국어를 모국어로 쓰는 개발자라면 같은 내용을 이렇게 쓰지 않았을 표현을 모두 찾으십시오. 영어 낱말을 사전에 나오는 대응어로 옮겨 이 문맥에서 어색해진 말, 영어 문장 구조를 그대로 따른 문장, 누가 무엇을 하는지 흐린 문장이 여기에 듭니다. 맞춤법이 맞고 한국 개발자가 실제로 쓰는 표현은 지적하지 마십시오. 화면 문구와 주석은 소스 코드에서 한국어 부분만 잘라 왔으므로 `{count}` 같은 자리 표시는 값이 들어갈 자리로 읽으십시오. 변수 이름, 백틱 안의 코드, 경로, 제품 이름은 고치지 말고 한국어 문구만 보십시오.',
  'JSON 한 줄로만 답하십시오. 문제가 없으면 {"ok": true}, 있으면 {"ok": false, "issues": [{"where": "이름과 줄 번호", "text": "고칠 표현", "fix": "고친 표현", "why": "짧은 이유"}]}입니다.',
].join('\n');

/* Claude에게 보내는 알림에는 지적을 이 수까지만 보여 줍니다. 이 수를 넘는 지적은 개수만 알립니다. */
export const MAX_ISSUES = 8;

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/* 파일 쓰기 도구 호출 하나가 새로 쓴 줄 가운데 한글이 든 줄을 돌려줍니다. `Edit` 호출에서는 바꾸기 전 문자열에 없던 줄만 고릅니다. */
export function writtenLines(name, input) {
  const pairs = [];
  if (name === 'Write') pairs.push(['', input?.content]);
  else if (name === 'Edit') pairs.push([input?.old_string, input?.new_string]);
  else if (name === 'MultiEdit' && Array.isArray(input?.edits)) {
    for (const edit of input.edits) pairs.push([edit?.old_string, edit?.new_string]);
  } else if (name === 'NotebookEdit') pairs.push(['', input?.new_source]);
  const lines = [];
  for (const [before, after] of pairs) {
    if (typeof after !== 'string') continue;
    const old = new Set(String(before ?? '').split('\n').map((line) => line.trim()));
    for (const line of after.split('\n')) {
      const trimmed = line.trim();
      if (hangulCount(trimmed) > 0 && !old.has(trimmed)) lines.push(trimmed);
    }
  }
  return lines;
}

/* 줄마다 코드 블록 안에 있는지 표시한 배열을 돌려줍니다. */
export function fencedLines(lines) {
  const fenced = new Array(lines.length).fill(false);
  let open = false;
  lines.forEach((line, i) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced[i] = true;
      open = !open;
    } else {
      fenced[i] = open;
    }
  });
  return fenced;
}

/* 지금 파일에서 그 줄이 몇째 줄인지 찾습니다. 문서의 코드 블록 안에 있는 줄과 쓴 뒤에 지워진 줄은 뺍니다. */
export function locateLines(filePath, wanted) {
  let text;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const lines = text.split('\n');
  const fenced = /\.(?:md|mdx|markdown)$/i.test(filePath) ? fencedLines(lines) : null;
  const want = new Set(wanted);
  const found = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (want.has(trimmed) && !(fenced !== null && fenced[i])) found.push({ no: i + 1, text: trimmed });
  });
  return found;
}

/* 소스 코드 한 줄에서 첫 한글부터 마지막 한글 뒤 문장 부호까지 잘라 돌려줍니다. 문서 파일의 줄은 그대로 돌려줍니다. */
export function koreanSpan(line, filePath) {
  if (/\.(?:md|mdx|markdown|txt)$/i.test(filePath)) return line;
  const first = line.search(/[가-힣]/u);
  if (first === -1) return line;
  let last = first;
  for (let i = first; i < line.length; i += 1) if (/[가-힣]/u.test(line[i])) last = i;
  const tail = line.slice(last + 1).match(/^[.!?)\]」』]*/u)[0];
  return line.slice(first, last + 1 + tail.length);
}

/* 코드 블록을 뺀 글을 돌려줍니다. */
export function withoutCodeBlocks(text) {
  const lines = text.split('\n');
  const fenced = fencedLines(lines);
  return lines.filter((_, i) => !fenced[i]).join('\n').trim();
}

/* 숫자와 `{count}` 같은 자리 표시를 같은 기호로 바꾸고 공백을 지웁니다. 사용자가 준 문장에서 숫자만 바꿔 넣은 줄도 같은 문장으로 알아보려는 것입니다. */
function normalized(text) {
  return text.replace(/\$?\{[^}]*\}|\d+(?:[.,]\d+)*/g, '#').replace(/\s+/g, '');
}

/* 사용자가 요청에 쓴 글을 비교할 형태로 바꿉니다. 요청 전체와 함께 문장, 콜론 뒤, 따옴표 안을 따로 떼어 둡니다. */
export function quotedFrom(prompt) {
  const parts = String(prompt).split(/(?<=[.!?:])\s+|["“”‘’「」『』\n]/).map(normalized).filter((part) => part.length >= 8);
  return { whole: normalized(String(prompt)), parts };
}

/* 사용자가 요청에 직접 쓴 문장을 뺀 줄을 돌려줍니다. Claude가 따옴표로 감싸 다시 보여 준 사용자 문장도 뺍니다. 사용자가 준 문장은 사용자가 고치라고 하지 않았으면 Claude가 바꾸면 안 되므로 검토 모델에게 보내지 않습니다. */
export function withoutQuoted(line, quoted) {
  if (quoted.whole.length === 0) return line;
  const kept = line.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const key = normalized(sentence);
    if (hangulCount(sentence) === 0 || key.length < 8) return true;
    return !quoted.whole.includes(key) && !quoted.parts.some((part) => key.includes(part));
  });
  return kept.join(' ').trim();
}

function textKey(text) {
  return `text:${createHash('sha1').update(text.trim()).digest('hex')}`;
}

/* 이번 요청에서 쓴 파일의 줄, 커밋 메시지, PR이나 이슈에 올린 글, 답변을 검토 모델에게 보낼 조각으로 모읍니다. 결과가 오류로 끝난 도구 호출, 규칙 문서에서 검사하지 않기로 한 경로, 프로젝트 밖 파일, 이미 검토한 항목은 뺍니다. 조각의 한글을 앞에서부터 더해 `reviewer-max-hangul`을 넘으면 그 조각부터는 보내지 않습니다. 첫 조각은 이 수를 넘어도 보냅니다. */
export function collectPieces(entries, { projectRoot, rules, answer = null, reviewed = new Set(), prompt = '' }) {
  const quoted = quotedFrom(prompt);
  const unquoted = (text) => text.split('\n').map((line) => withoutQuoted(line, quoted)).join('\n').trim();
  const failed = new Set();
  for (const entry of entries) {
    if (entry?.type !== 'user' || !Array.isArray(entry.message?.content)) continue;
    for (const part of entry.message.content) {
      if (part?.type === 'tool_result' && part.is_error === true) failed.add(part.tool_use_id);
    }
  }

  const files = new Map();
  const messages = [];
  const said = [];
  const ids = new Set();
  for (const entry of entries) {
    if (entry?.type !== 'assistant' || !Array.isArray(entry.message?.content)) continue;
    for (const part of entry.message.content) {
      if (part?.type === 'text') {
        if (answer === null || typeof part.text !== 'string' || part.text.trim().length === 0) continue;
        const key = textKey(part.text);
        if (reviewed.has(key)) continue;
        said.push(part.text);
        ids.add(key);
        continue;
      }
      if (part?.type !== 'tool_use' || typeof part.id !== 'string') continue;
      if (failed.has(part.id) || reviewed.has(part.id)) continue;
      if (FILE_TOOLS.has(part.name)) {
        const target = part.input?.file_path ?? part.input?.notebook_path;
        if (typeof target !== 'string' || target.length === 0) continue;
        ids.add(part.id);
        const absolute = isAbsolute(target) ? target : resolve(projectRoot, target);
        const rel = toProjectRelative(absolute, projectRoot);
        if (rel === null || matchesAny(rel, rules.skipGlobs)) continue;
        const lines = writtenLines(part.name, part.input);
        if (lines.length === 0) continue;
        const known = files.get(absolute);
        files.set(absolute, { rel, lines: [...(known?.lines ?? []), ...lines] });
      } else if (part.name === 'Bash') {
        ids.add(part.id);
        const command = part.input?.command;
        /* `git commit -m`을 여러 번 쓰면 git이 문단으로 이어 붙이므로 메시지 하나로 봅니다. */
        const commit = commitMessagesIn(command);
        if (commit.length > 0) messages.push({ label: '커밋 메시지', text: commit.join('\n\n') });
        const posted = pullRequestTextsIn(command);
        if (posted.length > 0) messages.push({ label: 'PR이나 이슈에 올린 글', text: posted.join('\n\n') });
      }
    }
  }

  const pieces = [];
  for (const [absolute, { rel, lines }] of files) {
    const located = locateLines(absolute, lines)
      .map(({ no, text }) => ({ no, text: withoutQuoted(koreanSpan(text, rel), quoted) }))
      .filter(({ text }) => hangulCount(text) > 0);
    if (located.length > 0) pieces.push({ label: rel, lines: located.map(({ no, text }) => `${no}: ${text}`) });
  }
  for (const { label, text } of messages) {
    const body = unquoted(withoutCodeBlocks(String(text)));
    if (hangulCount(body) > 0) pieces.push({ label, lines: body.split('\n') });
  }
  if (answer !== null) {
    const last = typeof answer === 'string' ? answer.trim() : '';
    if (last.length > 0 && !reviewed.has(textKey(last)) && !said.some((text) => text.trim() === last)) {
      said.push(last);
      ids.add(textKey(last));
    }
    const body = unquoted(withoutCodeBlocks(said.join('\n\n')));
    const min = rules.reviewerAnswerMinHangul;
    if (min > 0 && hangulCount(body) >= min) pieces.push({ label: '답변', lines: body.split('\n') });
  }

  const kept = [];
  let hangul = 0;
  for (const piece of pieces) {
    const count = hangulCount(piece.lines.join('\n'));
    if (kept.length > 0 && hangul + count > rules.reviewerMaxHangul) break;
    kept.push(piece);
    hangul += count;
  }
  return { pieces: kept, ids: [...ids], hangul };
}

/* 조각마다 `[이름]` 줄을 붙여 검토 모델에게 보낼 글로 잇습니다. */
export function reviewInput(pieces) {
  return pieces.map((piece) => `[${piece.label}]\n${piece.lines.join('\n')}`).join('\n\n');
}

/* 검토 모델의 답에서 JSON을 꺼냅니다. 형식이 맞지 않으면 null을 돌려줍니다. */
export function parseVerdict(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let verdict;
  try {
    verdict = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (verdict?.ok === true) return { ok: true, issues: [] };
  if (verdict?.ok !== false) return null;
  const issues = (Array.isArray(verdict.issues) ? verdict.issues : [])
    .filter((issue) => typeof issue?.text === 'string' && typeof issue?.fix === 'string' && issue.text.trim() !== issue.fix.trim())
    .map((issue) => ({ where: String(issue.where ?? ''), text: issue.text, fix: issue.fix, why: String(issue.why ?? '') }));
  return { ok: issues.length === 0, issues };
}

/* `claude -p`로 검토 모델을 부릅니다. 이 세션은 도구와 MCP 서버를 쓰지 않고 설정 파일도 읽지 않습니다. 빈 임시 디렉터리에서 실행하므로 프로젝트의 hook과 CLAUDE.md가 끼어들지 않습니다. 실행에 실패하거나 시간을 넘기면 null을 돌려줍니다. */
export function runReviewer(input, options) {
  const outer = callReviewer(input, options);
  return outer === null ? null : parseVerdict(outer.result);
}

/* 검토 모델을 부르고 `claude -p`가 출력한 JSON을 그대로 돌려줍니다. `runReviewer`도 이 함수로 검토 모델을 부릅니다. 평가 스크립트는 여기에 든 비용과 시간을 집계합니다. */
export function callReviewer(input, { model, timeoutSeconds }) {
  const command = process.env.KOREAN_STYLE_REVIEWER_COMMAND || 'claude';
  const cwd = join(tmpdir(), 'korean-style-review', 'cwd');
  try {
    mkdirSync(cwd, { recursive: true });
  } catch {
    return null;
  }
  /* 검토 모델 세션 안에서 이 hook이 다시 실행되면 바로 끝나도록 이 환경 변수를 `1`로 정합니다. */
  const env = { ...process.env, KOREAN_STYLE_REVIEWING: '1' };
  delete env.CLAUDE_PROJECT_DIR;
  const args = [
    '-p', '--model', model, '--system-prompt', REVIEWER_PROMPT,
    '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence',
    '--output-format', 'json',
  ];
  const result = spawnSync(command, args, {
    input, cwd, env, encoding: 'utf-8', timeout: Math.max(1, timeoutSeconds) * 1000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  let outer;
  try {
    outer = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  return outer !== null && typeof outer === 'object' && outer.is_error !== true ? outer : null;
}

/* 이미 검토한 도구 호출과 답변을 세션마다 임시 디렉터리에 기록합니다. 같은 요청에서 Claude가 여러 번 멈춰도 같은 글을 검토 모델에게 다시 보내지 않으려는 것입니다. */
function statePath(key) {
  return join(tmpdir(), 'korean-style-review', `${String(key).replace(/[^\w-]/g, '_')}.json`);
}

export function loadReviewed(key) {
  try {
    return new Set(JSON.parse(readFileSync(statePath(key), 'utf-8')));
  } catch {
    return new Set();
  }
}

export function saveReviewed(key, ids) {
  try {
    mkdirSync(dirname(statePath(key)), { recursive: true });
    writeFileSync(statePath(key), JSON.stringify([...ids].slice(-2000)));
  } catch {
    /* 기록하지 못하면 다음에 같은 글을 다시 보낼 뿐입니다. */
  }
}

/* 검토 모델의 지적을 답변에 대한 것과 파일, 커밋 메시지, PR과 이슈 글에 대한 것으로 나눕니다. 위치에 `답변`이 적혀 있거나 고칠 표현이 답변 조각에만 들어 있으면 답변에 대한 지적으로 봅니다. */
export function splitIssues(issues, pieces) {
  const textOf = (wanted) => pieces.filter((piece) => (piece.label === '답변') === wanted).map((piece) => piece.lines.join('\n')).join('\n');
  const said = textOf(true);
  const written = textOf(false);
  const answer = [];
  const work = [];
  for (const issue of issues) {
    const quoted = issue.text.trim();
    const answerOnly = quoted.length > 0 && said.includes(quoted) && !written.includes(quoted);
    (issue.where.includes('답변') || answerOnly ? answer : work).push(issue);
  }
  return { answer, work };
}

function issueLines(issues, withWhere) {
  const shown = issues.slice(0, MAX_ISSUES).map((issue) => {
    const where = withWhere && issue.where ? `${issue.where}: ` : '';
    const why = issue.why ? ` (${issue.why})` : '';
    return `- ${where}\`${issue.text}\` → \`${issue.fix}\`${why}`;
  });
  if (issues.length > MAX_ISSUES) shown.push(`- 그 밖에 ${issues.length - MAX_ISSUES}곳이 더 있습니다.`);
  return shown.join('\n');
}

/* 파일, 커밋 메시지, PR과 이슈 글에 대한 지적을 Claude에게 알리는 문구를 만듭니다. 답변에 대한 지적은 넣지 않습니다. */
export function reviewMessage(issues, model) {
  return (
    `한국어 검토: 이번 요청에서 파일, 커밋 메시지, PR과 이슈 글에 쓴 한국어를 검토 모델(${model})이 따로 읽었습니다. ` +
    '검토 모델이 한국어를 모국어로 쓰는 사람이라면 쓰지 않을 표현이라고 본 곳은 아래와 같습니다. ' +
    '지적이 맞고 고쳐도 뜻이 바뀌지 않으면 파일은 그 줄을 고치고 커밋 메시지는 아직 push하지 않았을 때만 고쳐서 다시 커밋하십시오. PR과 이슈에 올린 글은 고치지 말고 지적만 사용자에게 알리십시오. ' +
    '고쳤으면 무엇을 고쳤는지, 고치지 않았으면 그 이유를 사용자에게 한 문장으로 알리십시오. 사용자에게 무엇을 읽거나 하라고 요청하지 마십시오.\n' +
    issueLines(issues, true)
  );
}

/* 답변에 대한 지적은 세션마다 임시 디렉터리의 파일에 모아 둡니다. 다음 요청 때 UserPromptSubmit hook이 그 지적을 Claude에게만 알리고 파일을 지웁니다. 답변은 이미 화면에 나왔으므로 Claude를 깨워 고친 답변을 다시 보여 주게 하지 않습니다. */
function answerIssuesPath(sessionId) {
  return statePath(`${sessionId}-answer`);
}

export function saveAnswerIssues(sessionId, issues) {
  const path = answerIssuesPath(sessionId);
  try {
    let kept = [];
    try {
      kept = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      kept = [];
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify([...kept, ...issues].slice(-MAX_ISSUES)));
  } catch {
    /* 기록하지 못하면 다음 요청 때 그 지적을 알리지 못할 뿐입니다. */
  }
}

export function takeAnswerIssues(sessionId) {
  const path = answerIssuesPath(sessionId);
  let issues;
  try {
    issues = JSON.parse(readFileSync(path, 'utf-8'));
    rmSync(path, { force: true });
  } catch {
    return [];
  }
  return Array.isArray(issues) ? issues.filter((issue) => typeof issue?.text === 'string' && typeof issue?.fix === 'string') : [];
}

/* 앞 답변에 대한 지적을 다음 요청 때 Claude에게 알리는 문구를 만듭니다. */
export function answerReminder(issues) {
  return (
    '앞 답변을 검토 모델이 따로 읽고 아래 표현이 어색하다고 지적했습니다. 이번 답변부터 같은 표현을 쓰지 마십시오. ' +
    '앞 답변을 고쳐 다시 보여 주거나 이 지적을 사용자에게 말하지 마십시오.\n' +
    issueLines(issues, false)
  );
}
