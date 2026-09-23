#!/usr/bin/env node
/* 도구를 실행하기 직전에 문체 위반을 막는 hook입니다. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEntryPoint, projectRoot, rulesDocPath } from '../lib/paths.mjs';
import { loadRules } from '../lib/rules.mjs';
import { checkText, checkToolCall, formatToolViolations, formatViolations, blockingViolations } from '../lib/check.mjs';
import { targetForPath, toProjectRelative } from '../lib/targets.mjs';

const PROJECT_ROOT = projectRoot();
const RULES_DOC = rulesDocPath(PROJECT_ROOT);

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

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

  const violations = blockingViolations(checkText(resultOfEdit(toolName, ti, filePath), rules, target, { path: rel }));
  if (violations.length === 0) process.exit(0);
  deny(formatViolations(violations, rules, `${rel} (${target})`));
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
