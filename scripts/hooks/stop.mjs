#!/usr/bin/env node
/* turn이 끝나는 시점에 AI가 사용자에게 한 답변을 검사합니다. */
import { readFileSync } from 'node:fs';
import { isEntryPoint, projectRoot, rulesDocPath } from '../lib/paths.mjs';
import { loadRules } from '../lib/rules.mjs';
import { checkText, blockingViolations } from '../lib/check.mjs';

const PROJECT_ROOT = projectRoot();
const RULES_DOC = rulesDocPath(PROJECT_ROOT);

/* 이 turn에서 사용자에게 보인 답변 산문을 모두 모읍니다. */
export function lastAssistantText(transcriptPath) {
  let raw;
  try {
    raw = readFileSync(transcriptPath, 'utf-8');
  } catch {
    return null;
  }
  const lines = raw.split('\n');
  const pieces = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    /* 사용자 메시지가 나오면 그곳이 이 turn의 시작입니다. */
    if (entry.type === 'user') {
      const content = entry.message?.content;
      if (Array.isArray(content) && content.length > 0 && content.every(p => p.type === 'tool_result')) continue;
      break;
    }
    if (entry.type !== 'assistant') continue;
    const content = entry.message?.content;
    if (typeof content === 'string') {
      pieces.push(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim();
    /* text 조각이 없는 assistant 줄은 도구 호출만 담은 줄입니다. */
    if (text.length > 0) pieces.push(text);
  }
  if (pieces.length === 0) return null;
  /* 뒤에서부터 모았으므로 순서를 뒤집습니다. */
  return pieces.reverse().join('\n\n');
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
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

  /* 이 hook 때문에 이미 이어진 turn이면 다시 차단하지 않습니다. */
  if (input.stop_hook_active === true) process.exit(0);

  /* Stop은 마지막 메시지가 transcript에 기록되기 전에 실행될 수 있습니다. */
  const text = typeof input.last_assistant_message === 'string'
    ? input.last_assistant_message : lastAssistantText(input.transcript_path ?? '');
  if (text === null || text.trim().length === 0) process.exit(0);

  const rules = loadRules(RULES_DOC);
  const violations = blockingViolations(checkText(text, rules, 'chat'));
  if (violations.length === 0) process.exit(0);

  block(
    `내용은 그대로 두고 아래 표현을 고쳐 답변을 한 번 다시 작성하십시오. 교정 설명은 붙이지 마십시오.\n` +
    violations.slice(0, 3).map(v => `[${v.rule}] ${v.line}줄: ${v.detail}`).join('\n') +
    `\n규칙: ${RULES_DOC} (설명: check-korean.mjs --explain <규칙 이름>)`,
  );
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
