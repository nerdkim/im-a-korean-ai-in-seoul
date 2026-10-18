#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules, REGISTER_BANNED_ENDINGS } from './lib/rules.mjs';
import { CHAR_CLASSES } from './lib/rules/chars.mjs';
import { attributionViolations } from './lib/rules/attribution.mjs';
import { readSettings, localSettingsPaths, commitHookState, installCommitHook, reportCommitHook } from './lib/setup.mjs';

const tool = dirname(dirname(fileURLToPath(import.meta.url)));
const installed = basename(tool) === '.korean-style';
const root = installed ? dirname(tool) : tool;
const rulesPath = join(tool, installed ? 'rules.md' : 'docs/rules.md');
let failures = 0, warnings = 0;
const ok = message => console.log(`  통과  ${message}`);
const bad = message => { failures++; console.log(`  실패  ${message}`); };
const warn = message => { warnings++; console.log(`  주의  ${message}`); };

if (process.argv.includes('--install-commit-hook')) {
  try {
    const result = installCommitHook(root);
    reportCommitHook(result);
    process.exit(['linked', 'already'].includes(result.state) ? 0 : 1);
  } catch (e) { console.error(e.message); process.exit(1); }
}

console.log(`한국어 문체 점검 (${installed ? '설치된 프로젝트' : '이 도구의 저장소'})\n  프로젝트: ${root}`);
const rules = loadRules(rulesPath);
if (!existsSync(rulesPath)) bad(`규칙 문서가 없습니다: ${rulesPath}`);
else if (!rules.source) bad('규칙 문서에 유효한 korean-style-rules 블록이 없습니다');
else ok('규칙 문서가 있고 규칙 블록을 읽었습니다');
if (!Object.hasOwn(REGISTER_BANNED_ENDINGS, rules.register)) bad(`알 수 없는 말투입니다: ${rules.register}`);
for (const name of rules.bannedChar) {
  if (!Object.hasOwn(CHAR_CLASSES, name)) bad(`알 수 없는 금지 문자 종류입니다: ${name}`);
}
if (rules.source && rules.reviewRules.length === 0) {
  warn('review-rules가 없거나 비어 있어 hook이 영어식 표현 같은 경고를 Claude에게 알리지 않습니다. 기본 규칙의 review-rules 줄을 옮겨 오면 알림이 켜집니다.');
}
/* 경고 규칙이 아닌 이름은 오타이거나 쓰기를 막는 규칙이므로 알림이 나가지 않습니다. */
const strayReview = rules.reviewRules.filter((name) => !rules.advisoryRules.includes(name));
if (strayReview.length > 0) warn(`review-rules의 다음 이름은 advisory-rules에 없어서 hook이 알리지 않습니다: ${strayReview.join(', ')}`);
const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
delete env.KOREAN_STYLE_RULES;
const check = spawnSync(process.execPath, [join(tool, 'scripts/check-korean.mjs'), '--self-check'], { env, encoding: 'utf8' });
if (check.status === 0) ok('검사기가 자체 검사를 통과했습니다');
else bad('검사기가 자체 검사에 실패했습니다');

const settingsPath = join(root, '.claude/settings.json');
const sources = [];
for (const path of [settingsPath, ...localSettingsPaths(root)]) {
  try {
    const settings = readSettings(path);
    if (settings) sources.push({ path, settings });
    else if (path === settingsPath) bad(`settings.json이 없습니다: ${path}`);
  } catch (e) { bad(e.message); }
}
const effective = Object.assign({}, ...sources.map(s => s.settings));
if (effective.disableAllHooks === true) bad('disableAllHooks로 hook이 꺼져 있습니다');
/* 설정 파일은 프로젝트 설정, 로컬 설정 순서로 읽었습니다. 로컬 설정이 우선하므로 값이 있는 파일 가운데 마지막 파일의 값을 봅니다. 프로젝트에서 정해 둔 공동 작성자 줄처럼 생성 표시가 아닌 값에는 주의를 출력하지 않습니다. */
const attributionOf = key => sources.map(s => s.settings.attribution?.[key]).filter(v => v !== undefined).at(-1);
for (const [key, label] of [['commit', '커밋 메시지'], ['pr', 'PR 설명']]) {
  const value = attributionOf(key);
  if (value === undefined || value === null) {
    warn(`attribution의 ${key} 값이 없어 Claude Code가 ${label}에 생성 표시를 붙입니다. 설치 명령을 다시 실행하면 설치 스크립트가 빈 문자열로 채웁니다.`);
  } else if (typeof value === 'string' && attributionViolations(value, rules).length > 0) {
    warn(`attribution의 ${key} 값에 생성 표시가 들어 있어 Claude Code가 ${label}에 이 값을 붙입니다. 설치 스크립트는 정해 둔 값을 바꾸지 않으므로 직접 빈 문자열로 바꿔야 합니다.`);
  }
}
for (const [event, name] of [['UserPromptSubmit', 'userprompt'], ['PreToolUse', 'pretooluse'], ['Stop', 'stop']]) {
  const command = `node "$CLAUDE_PROJECT_DIR/${installed ? '.korean-style/' : ''}scripts/hooks/${name}.mjs"`;
  const entries = sources.flatMap(s => s.settings.hooks?.[event] ?? []).filter(e => e.hooks.some(h =>
    h.type === 'command' && h.command === command && h.async !== true));
  if (!existsSync(join(tool, 'scripts/hooks', `${name}.mjs`))) bad(`${name} 파일이 없습니다`);
  else if (!entries.length) bad(`${event}에 올바른 ${name} 명령이 없습니다. 다시 설치하면 복구됩니다.`);
  else {
    ok(`${name} hook 연결: ${event}`);
    if (event === 'PreToolUse') {
      const covered = name => entries.some(e => {
        try { return new RegExp(`^(?:${e.matcher || '.*'})$`).test(name); } catch { return false; }
      });
      for (const name of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'AskUserQuestion', 'ExitPlanMode', 'SendUserFile', 'Task', 'Agent', 'Bash']) {
        if (covered(name)) ok(`PreToolUse 검사 대상: ${name}`);
        else bad(`PreToolUse 검사 대상에서 빠졌습니다: ${name}. 다시 설치하면 복구됩니다.`);
      }
    }
  }
}
const stylePath = join(root, '.claude/output-styles/korean-style.md');
if (!existsSync(stylePath)) bad('output-style 파일이 없습니다');
else ok('output-style 파일이 있습니다');
if (effective.outputStyle === 'korean-style') ok('outputStyle이 korean-style로 설정되어 있습니다');
else bad(`${effective.outputStyle ? `outputStyle이 \`${effective.outputStyle}\` 값으로 설정되어 있습니다` : 'outputStyle이 설정되어 있지 않습니다'}. --activate를 붙여 다시 설치하거나 로컬 설정에서 korean-style을 고르면 됩니다.`);
for (const name of ['korean-style', 'korean-rewrite']) {
  if (existsSync(join(root, '.claude/skills', name, 'SKILL.md'))) ok(`${name} skill이 있습니다`);
  else bad(`${name} skill이 없습니다`);
}
if (installed && !existsSync(join(tool, 'defaults.sha256'))) warn('기본 규칙 해시(defaults.sha256)가 없어 다시 설치해도 기존 규칙이 그대로 남습니다. 새 기본 규칙으로 바꾸려면 --force를 붙여 다시 설치해야 합니다.');
try {
  const hook = commitHookState(root);
  if (hook.state === 'not-git') console.log('  건너뜀  프로젝트 루트에 .git이 없습니다');
  else if (hook.state === 'broken') bad(`commit-msg hook의 symlink가 끊겼습니다: ${hook.path}`);
  else if (hook.state === 'missing') warn('commit-msg hook이 없습니다. --install-commit-hook으로 설치할 수 있습니다.');
  else if (!hook.executable) bad(`commit-msg hook에 실행 권한이 없습니다: ${hook.path}`);
  else if (hook.state === 'occupied') warn('다른 commit-msg hook이 이미 있습니다. 그 hook이 한국어 검사기를 호출하는지는 직접 확인해야 합니다.');
  else ok('commit-msg hook이 연결되어 있고 실행 권한도 있습니다');
} catch (e) { bad(`commit-msg hook을 점검하지 못했습니다: ${e.message}`); }
if (installed && existsSync(join(root, '.git'))) {
  for (const path of ['.korean-style/rules.md', '.korean-style/defaults.sha256', '.claude/settings.json']) {
    if (spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root }).status === 0) {
      warn(`Git에서 제외된 파일입니다: ${path}. 팀과 공유하려면 ignore 규칙을 고쳐야 합니다.`);
    }
  }
}
console.log(`\n실패 ${failures}개, 주의 ${warnings}개`);
process.exitCode = failures ? 1 : 0;
