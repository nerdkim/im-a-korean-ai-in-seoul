#!/usr/bin/env node
/* Claude가 요청 하나에 답을 마칠 때 사용자에게 한 답변을 검사합니다. */
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isEntryPoint, projectRoot, rulesDocPath, toolRoot } from '../lib/paths.mjs';
import { currentTurn, needsSkill, skillRequest } from '../lib/skill.mjs';
import { loadRules } from '../lib/rules.mjs';
import { checkText, blockingViolations } from '../lib/check.mjs';

const PROJECT_ROOT = projectRoot();
const RULES_DOC = rulesDocPath(PROJECT_ROOT);

/* 이 요청에서 사용자에게 보인 답변 산문을 모두 모읍니다. */
export function lastAssistantText(transcriptPath) {
  const entries = currentTurn(transcriptPath);
  if (entries === null) return null;
  const pieces = [];
  for (const entry of entries) {
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
  return pieces.length === 0 ? null : pieces.join('\n\n');
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

  /* Stop hook이 이미 한 번 다시 쓰게 한 답변이면 또 요구하지 않습니다. */
  if (input.stop_hook_active === true) process.exit(0);

  /* Stop은 마지막 메시지가 transcript에 기록되기 전에 실행될 수 있습니다. */
  const text = typeof input.last_assistant_message === 'string'
    ? input.last_assistant_message : lastAssistantText(input.transcript_path ?? '');
  if (text === null || text.trim().length === 0) process.exit(0);

  const rules = loadRules(RULES_DOC);
  const skipped = needsSkill({ text, rules, projectRoot: PROJECT_ROOT, transcriptPath: input.transcript_path ?? '' });
  const violations = blockingViolations(checkText(text, rules, 'chat'));
  if (!skipped && violations.length === 0) process.exit(0);

  const parts = [];
  if (skipped) parts.push(skillRequest(rules.writingSkill, '답변을 다시 쓰십시오.'));
  if (violations.length > 0) {
    /* 설치한 프로젝트에서는 검사기 경로가 `.korean-style/scripts/check-korean.mjs`가 됩니다. */
    const checker = relative(PROJECT_ROOT, join(toolRoot(), 'scripts', 'check-korean.mjs')).split(sep).join('/');
    parts.push(
      `${skipped ? '다시 쓸 때 아래 표현도 고치십시오.' : '아래 표현을 고쳐 답변을 다시 쓰십시오.'}\n` +
      violations.slice(0, 3).map(v => `[${v.rule}] ${v.line}줄: ${v.detail}`).join('\n') +
      `\n규칙 문서: ${RULES_DOC}\n규칙 설명은 \`node ${checker} --explain <규칙 이름>\` 명령으로 볼 수 있습니다.`,
    );
  }
  block(`${parts.join('\n\n')}\n내용은 그대로 두고 무엇을 고쳤는지는 답변에 적지 마십시오.`);
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
