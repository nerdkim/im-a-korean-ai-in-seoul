#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules, REGISTER_BANNED_ENDINGS } from './lib/rules.mjs';
import { CHAR_CLASSES } from './lib/rules/chars.mjs';
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
if (!Object.hasOwn(REGISTER_BANNED_ENDINGS, rules.register)) bad(`알 수 없는 어투입니다: ${rules.register}`);
for (const name of rules.bannedChar) {
  if (!Object.hasOwn(CHAR_CLASSES, name)) bad(`알 수 없는 금지 문자 종류입니다: ${name}`);
}
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
for (const [event, name] of [['PreToolUse', 'pretooluse'], ['Stop', 'stop']]) {
  const command = `node "$CLAUDE_PROJECT_DIR/${installed ? '.korean-style/' : ''}scripts/hooks/${name}.mjs"`;
  const entries = sources.flatMap(s => s.settings.hooks?.[event] ?? []).filter(e => e.hooks.some(h =>
    h.type === 'command' && h.command === command && h.async !== true));
  if (!existsSync(join(tool, 'scripts/hooks', `${name}.mjs`))) bad(`${name} 파일이 없습니다`);
  else if (!entries.length) bad(`${event}에 올바른 ${name} 명령이 없습니다. 다시 설치하면 복구됩니다`);
  else {
    ok(`${name} hook 연결: ${event}`);
    if (event === 'PreToolUse') {
      const covered = name => entries.some(e => {
        try { return new RegExp(`^(?:${e.matcher || '.*'})$`).test(name); } catch { return false; }
      });
      for (const name of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'AskUserQuestion', 'ExitPlanMode', 'SendUserFile', 'Task', 'Agent', 'Bash']) {
        if (covered(name)) ok(`PreToolUse 검사 대상: ${name}`);
        else bad(`PreToolUse 검사 대상에서 빠졌습니다: ${name}. 다시 설치하면 복구됩니다`);
      }
    }
  }
}
const stylePath = join(root, '.claude/output-styles/korean-style.md');
if (!existsSync(stylePath)) bad('output-style 파일이 없습니다');
else ok('output-style 파일이 있습니다');
if (effective.outputStyle === 'korean-style') ok('outputStyle이 korean-style로 설정되어 있습니다');
else bad(`outputStyle이 ${effective.outputStyle ?? '(없음)'}입니다. --activate로 재설치하거나 로컬 설정에서 korean-style을 선택합니다`);
for (const name of ['korean-style', 'korean-rewrite']) {
  if (existsSync(join(root, '.claude/skills', name, 'SKILL.md'))) ok(`${name} skill이 있습니다`);
  else bad(`${name} skill이 없습니다`);
}
if (installed && !existsSync(join(tool, 'defaults.sha256'))) warn('기본 규칙 해시(defaults.sha256)가 없어 재설치해도 기존 규칙을 유지합니다. 기본값을 적용하려면 --force로 재설치합니다');
try {
  const hook = commitHookState(root);
  if (hook.state === 'not-git') console.log('  건너뜀  프로젝트 루트에 .git이 없습니다');
  else if (hook.state === 'broken') bad(`commit-msg hook의 symlink가 끊겼습니다: ${hook.path}`);
  else if (hook.state === 'missing') warn('commit-msg hook이 없습니다. --install-commit-hook으로 설치할 수 있습니다');
  else if (!hook.executable) bad(`commit-msg hook에 실행 권한이 없습니다: ${hook.path}`);
  else if (hook.state === 'occupied') warn('기존 commit-msg hook을 유지합니다. 이 hook이 한국어 검사기를 부르는지는 직접 확인해야 합니다');
  else ok('commit-msg hook이 연결되어 있고 실행할 수 있습니다');
} catch (e) { bad(`커밋 hook 점검 실패: ${e.message}`); }
if (installed && existsSync(join(root, '.git'))) {
  for (const path of ['.korean-style/rules.md', '.korean-style/defaults.sha256', '.claude/settings.json']) {
    if (spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root }).status === 0) {
      warn(`Git에서 제외된 파일입니다: ${path}. 팀과 공유하려면 ignore 규칙을 조정합니다`);
    }
  }
}
console.log(`\n실패 ${failures}개, 주의 ${warnings}개`);
process.exitCode = failures ? 1 : 0;
