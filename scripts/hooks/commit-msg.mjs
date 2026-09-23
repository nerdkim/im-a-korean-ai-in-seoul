#!/usr/bin/env node
/* git이 부르는 commit-msg hook입니다. */
import { readFileSync } from 'node:fs';
import { isEntryPoint, projectRoot, rulesDocPath } from '../lib/paths.mjs';
import { loadRules } from '../lib/rules.mjs';
import { checkText, formatViolations, blockingViolations } from '../lib/check.mjs';

const PROJECT_ROOT = projectRoot();
const RULES_DOC = rulesDocPath(PROJECT_ROOT);

/* 메시지 파일에서 실제 메시지만 남깁니다. */
export function messageBody(raw) {
  return raw
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
}

function main() {
  const path = process.argv[2];
  /* 메시지 파일 없이 불렸으면 git이 부른 것이 아닙니다. */
  if (path === undefined) process.exit(0);

  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    process.exit(0);
  }

  const body = messageBody(raw);
  if (body.length === 0) process.exit(0);

  const rules = loadRules(RULES_DOC);
  const violations = blockingViolations(checkText(body, rules, 'commit'));
  if (violations.length === 0) process.exit(0);

  process.stderr.write(`${formatViolations(violations, rules, '커밋 메시지')}\n`);
  process.stderr.write('메시지를 고쳐 다시 커밋하십시오.\n');
  process.exit(1);
}

/* 직접 실행할 때만 동작합니다. */
const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch {
    /* 예외가 나면 통과시킵니다. */
    process.exit(0);
  }
}
