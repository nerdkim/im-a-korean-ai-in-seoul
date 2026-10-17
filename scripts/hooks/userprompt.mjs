#!/usr/bin/env node
/* 사용자가 프롬프트를 보낼 때마다 한국어 작성 skill을 먼저 부르라고 Claude에게 알립니다. */
import { readFileSync } from 'node:fs';
import { isEntryPoint, projectRoot, rulesDocPath } from '../lib/paths.mjs';
import { loadRules } from '../lib/rules.mjs';
import { skillInstalled } from '../lib/skill.mjs';

const PROJECT_ROOT = projectRoot();

/* Claude에게 전하는 안내입니다. */
export function skillReminder(name) {
  return (
    `이 프로젝트에서는 한국어를 쓰는 turn마다 ${name} skill을 거쳐야 합니다. ` +
    `한국어로 답하거나 한국어가 들어간 파일, 주석, 커밋 메시지를 쓰기 전에 Skill 도구로 ${name} skill을 먼저 부르고 그 절차대로 쓰십시오.`
  );
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function run() {
  try {
    JSON.parse(readStdin());
  } catch {
    process.exit(0);
  }
  const rules = loadRules(rulesDocPath(PROJECT_ROOT));
  if (!skillInstalled(PROJECT_ROOT, rules.writingSkill)) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: skillReminder(rules.writingSkill) },
    }),
  );
  process.exit(0);
}

/* 직접 실행할 때만 동작합니다. */
if (isEntryPoint(import.meta.url)) {
  try {
    run();
  } catch {
    /* 예외가 나면 통과시킵니다. */
    process.exit(0);
  }
}
