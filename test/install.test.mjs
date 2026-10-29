/* 설치 테스트입니다. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, readdirSync, symlinkSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INSTALLED_DIR, rulesDocPath } from '../scripts/lib/paths.mjs';
import { loadRules, withRegister } from '../scripts/lib/rules.mjs';
import { checkText } from '../scripts/lib/check.mjs';
import { REGISTER_FRAGMENTS, mergeOutputStyle } from '../scripts/install.mjs';
import { MISSING_SCRIPTS_NOTICE, PROGRESS_SUMMARY_ENV, hookCommand, isOffValue } from '../scripts/lib/setup.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* korean-style skill을 설치할 경로입니다. */
const SKILL_REL = join('.claude', 'skills', 'korean-style', 'SKILL.md');

/* 작성 지침을 설치할 경로입니다. */
const STYLE_REL = join('.claude', 'output-styles', 'korean-style.md');

/* 설치할 프로젝트로 쓸 빈 디렉터리입니다. */
const temporary = [];
const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), 'korean-style-install-'));
  temporary.push(root);
  return root;
};
after(() => temporary.forEach(path => rmSync(path, { recursive: true, force: true })));

/* git 저장소로 만든 빈 디렉터리입니다. */
function gitScratch() {
  const target = scratch();
  const r = spawnSync('git', ['init', '-q'], { cwd: target, encoding: 'utf-8' });
  assert.equal(r.status, 0, `git init이 실패했습니다: ${r.stderr}`);
  return target;
}

/* 자식 프로세스가 쓸 환경입니다. */
function envFor(root) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  delete env.KOREAN_STYLE_RULES;
  return env;
}

/* 설치 스크립트를 자식 프로세스로 띄웁니다. */
function install(target, extra = []) {
  return spawnSync('node', [join(ROOT, 'scripts', 'install.mjs'), '--target', target, ...extra], {
    encoding: 'utf-8',
    cwd: ROOT,
    env: envFor(ROOT),
  });
}

/* 설치된 검사기를 그 프로젝트 안에서 띄웁니다. */
function runInstalled(target, args) {
  return spawnSync('node', [join(target, INSTALLED_DIR, 'scripts', 'check-korean.mjs'), ...args], {
    encoding: 'utf-8',
    cwd: target,
    env: envFor(target),
  });
}

/* 설치된 hook을 그 프로젝트 안에서 띄우고 stdout을 JSON으로 읽습니다. */
function runInstalledHook(target, input) {
  const r = spawnSync('node', [join(target, INSTALLED_DIR, 'scripts', 'hooks', 'pretooluse.mjs')], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    cwd: target,
    env: envFor(target),
  });
  assert.equal(r.status, 0, `hook은 언제나 종료 코드 0으로 끝나야 합니다. 이번에는 ${r.status}입니다.`);
  const out = (r.stdout ?? '').trim();
  return out.length === 0 ? null : JSON.parse(out);
}

/* 규칙 문서를 미리 만들어 둡니다. */
function seedRules(target, body) {
  const path = join(target, INSTALLED_DIR, 'rules.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf-8');
  return path;
}

test('설치하면 파일이 제자리에 놓인다', () => {
  const target = scratch();
  const r = install(target);
  assert.equal(r.status, 0, r.stderr);

  const expected = [
    join(INSTALLED_DIR, 'rules.md'),
    join(INSTALLED_DIR, 'scripts', 'check-korean.mjs'),
    join(INSTALLED_DIR, 'scripts', 'lib', 'paths.mjs'),
    join(INSTALLED_DIR, 'scripts', 'lib', 'rules.mjs'),
    join(INSTALLED_DIR, 'scripts', 'lib', 'rules', 'punctuation.mjs'),
    join(INSTALLED_DIR, 'scripts', 'hooks', 'pretooluse.mjs'),
    join(INSTALLED_DIR, 'scripts', 'hooks', 'stop.mjs'),
    join(INSTALLED_DIR, 'scripts', 'hooks', 'commit-msg.mjs'),
    join(INSTALLED_DIR, 'LICENSE'),
    join(INSTALLED_DIR, 'docs', 'limits.md'),
    SKILL_REL,
    STYLE_REL,
    join('.claude', 'settings.json'),
  ];
  for (const rel of expected) {
    assert.ok(existsSync(join(target, rel)), `놓이지 않았습니다: ${rel}`);
  }
  /* 설계 근거 문서는 더 이상 배포하지 않습니다. */
  assert.ok(!existsSync(join(target, INSTALLED_DIR, 'docs', 'RESEARCH.md')), '없앤 문서가 설치되었습니다');
});

test('korean-rewrite skill도 함께 놓인다', () => {
  const target = scratch();
  install(target);
  const path = join(target, '.claude', 'skills', 'korean-rewrite', 'SKILL.md');
  assert.ok(existsSync(path), 'korean-rewrite skill이 놓여야 합니다');
  const body = readFileSync(path, 'utf-8');
  assert.match(body, /^---\nname: korean-rewrite/, 'skill은 frontmatter로 시작해야 읽힙니다');
});

test('두 skill이 모두 gitignore에 든다', () => {
  const target = gitScratch();
  install(target);
  const ignored = readFileSync(join(target, '.gitignore'), 'utf-8');
  for (const name of ['korean-style', 'korean-rewrite']) {
    assert.ok(ignored.includes(`.claude/skills/${name}/`), `gitignore에 ${name} 항목이 있어야 합니다`);
  }
});

test('korean-rewrite skill이 이 저장소의 규칙 검사를 통과한다', () => {
  /* 자기 규칙을 어기는 skill은 사용자가 곧바로 꺼 버립니다. */
  const rules = loadRules(rulesDocPath(ROOT));
  const body = readFileSync(join(ROOT, 'skill', 'korean-rewrite', 'SKILL.md'), 'utf-8');
  const violations = checkText(body, rules, 'doc');
  assert.equal(violations.length, 0, `위반이 있습니다: ${JSON.stringify(violations.slice(0, 3))}`);
});

/* commit-msg hook 테스트입니다. 전에는 설치 스크립트가 명령을 화면에 출력하기만 했습니다. */

test('설치하면 commit-msg hook이 실제로 걸린다', () => {
  const target = gitScratch();
  install(target);
  const hook = join(target, '.git', 'hooks', 'commit-msg');
  assert.ok(existsSync(hook), 'hook이 걸려야 합니다');
  /* hook이 끊어진 symlink이면 git이 아무 표시 없이 건너뜁니다. */
  assert.ok(existsSync(realpathSync(hook)), 'hook이 끊어진 symlink이면 안 됩니다');
});

test('설치된 commit-msg hook이 규칙을 어긴 메시지를 막는다', () => {
  const target = gitScratch();
  install(target);
  const msg = join(target, 'MSG');
  writeFileSync(msg, '확인했어요\n', 'utf-8');
  const r = spawnSync('node', [join(target, '.git', 'hooks', 'commit-msg'), msg], {
    encoding: 'utf-8',
    cwd: target,
    env: envFor(target),
  });
  assert.notEqual(r.status, 0, '위반을 막아야 합니다');
});

test('원래 있던 commit-msg hook을 덮어쓰지 않는다', () => {
  const target = gitScratch();
  const hooksDir = join(target, '.git', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const hook = join(hooksDir, 'commit-msg');
  writeFileSync(hook, '#!/bin/sh\nexit 0\n', 'utf-8');
  install(target);
  assert.match(readFileSync(hook, 'utf-8'), /exit 0/, '남의 hook을 지우면 이 도구를 설치하다가 그 프로젝트에 해를 끼치게 됩니다');
});

test('두 번 설치해도 commit-msg hook이 하나다', () => {
  const target = gitScratch();
  install(target);
  const first = realpathSync(join(target, '.git', 'hooks', 'commit-msg'));
  install(target);
  assert.equal(realpathSync(join(target, '.git', 'hooks', 'commit-msg')), first);
});

test('git 저장소가 아니면 commit-msg hook을 걸지 않는다', () => {
  const target = scratch();
  install(target);
  assert.ok(!existsSync(join(target, '.git')), 'git 디렉터리를 만들면 안 됩니다');
});

test('--dry-run을 주면 commit-msg hook을 걸지 않는다', () => {
  const target = gitScratch();
  install(target, ['--dry-run']);
  assert.ok(!existsSync(join(target, '.git', 'hooks', 'commit-msg')));
});

test('skill은 설치 디렉터리가 아니라 Claude Code가 찾는 경로에 놓인다', () => {
  /* 설치 디렉터리 안에 두면 skill이 아예 읽히지 않습니다. */
  const target = scratch();
  install(target);

  assert.ok(existsSync(join(target, SKILL_REL)));
  assert.ok(!existsSync(join(target, INSTALLED_DIR, 'skill')));
});

test('규칙 문서는 docs 아래가 아니라 설치 디렉터리 바로 아래에 놓인다', () => {
  /* 규칙 문서는 한 곳에만 있어야 합니다. */
  const target = scratch();
  install(target);

  assert.ok(existsSync(join(target, INSTALLED_DIR, 'rules.md')));
  assert.ok(!existsSync(join(target, INSTALLED_DIR, 'docs', 'rules.md')));
});

test('설치 스크립트 자체는 설치한 프로젝트에 복사하지 않는다', () => {
  /* 설치된 곳에서 또 설치할 일이 없습니다. */
  const target = scratch();
  install(target);

  assert.ok(!existsSync(join(target, INSTALLED_DIR, 'scripts', 'install.mjs')));
});

test('직접 고친 rules.md를 덮어쓰지 않는다', () => {
  const target = scratch();
  const mine = '# 이 프로젝트가 고친 규칙입니다\nregister: 다나까체\nbanned-address: 당신\n';
  const path = seedRules(target, mine);

  const r = install(target);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(path, 'utf-8'), mine);
});

test('--force를 주면 rules.md를 덮어쓴다', () => {
  const target = scratch();
  const path = seedRules(target, '# 지워질 규칙입니다\nregister: 다나까체\n');

  const r = install(target, ['--force']);
  assert.equal(r.status, 0, r.stderr);
  const after = readFileSync(path, 'utf-8');
  assert.ok(!after.includes('지워질 규칙입니다'));
  assert.match(after, /^register: /m);
});

test('--register 값이 규칙 문서에 반영된다', () => {
  const target = scratch();
  const r = install(target, ['--register', '해요체']);
  assert.equal(r.status, 0, r.stderr);

  const rules = readFileSync(join(target, INSTALLED_DIR, 'rules.md'), 'utf-8');
  assert.match(rules, /^register: 해요체$/m);
  assert.ok(!/^register: 합니다체$/m.test(rules));
});

test('--register를 주지 않으면 기본 말투인 합니다체가 남는다', () => {
  const target = scratch();
  install(target);

  const rules = readFileSync(join(target, INSTALLED_DIR, 'rules.md'), 'utf-8');
  assert.match(rules, /^register: 합니다체$/m);
});

test('예전 말투 이름 `다나까체`를 주면 합니다체를 고른 것으로 본다', () => {
  const target = scratch();
  const r = install(target, ['--register', '다나까체']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(target, INSTALLED_DIR, 'rules.md'), 'utf-8'), /^register: 합니다체$/m);
  const fragment = readFileSync(join(ROOT, 'skill', 'korean-style', 'register', REGISTER_FRAGMENTS.합니다체), 'utf-8').trim();
  assert.ok(readFileSync(join(target, SKILL_REL), 'utf-8').includes(fragment), '합니다체 문구가 들어가지 않았습니다');
});

test('0.3.0 기본 규칙으로 설치한 프로젝트에 다시 설치해도 `다나까체`라는 말투 이름은 그대로 둔다', () => {
  /* 규칙 문서는 팀이 함께 커밋합니다. 이름을 바꾸면 아직 0.3.0을 쓰는 팀원의 검사기가 `합니다체`를 알아보지 못해 말투 검사가 꺼집니다. */
  const target = scratch();
  assert.equal(install(target).status, 0);
  const rulesPath = join(target, INSTALLED_DIR, 'rules.md');
  const previous = readFileSync(rulesPath, 'utf8').replace(/^register:.*$/m, 'register: 다나까체').replace(/^banned-attribution:.*\n/m, '');
  writeFileSync(rulesPath, previous);
  writeFileSync(join(target, INSTALLED_DIR, 'defaults.sha256'), createHash('sha256').update(previous.replace(/^register:.*$/m, 'register:')).digest('hex'));
  assert.equal(install(target).status, 0);
  const rules = readFileSync(rulesPath, 'utf8');
  assert.match(rules, /^register: 다나까체$/m, '말투 이름이 바뀌었습니다');
  assert.match(rules, /^banned-attribution:/m, '새 기본 규칙이 들어가지 않았습니다');
  assert.equal(runInstalled(target, ['--text', '확인했어요.']).status, 1, '`register: 다나까체` 규칙에서 해요체는 위반입니다');
  assert.equal(doctor(target).status, 0);
});

test('`--register`로 말투를 고르면 규칙 문서에 새 이름을 적는다', () => {
  const target = scratch();
  assert.equal(install(target).status, 0);
  const rulesPath = join(target, INSTALLED_DIR, 'rules.md');
  writeFileSync(rulesPath, readFileSync(rulesPath, 'utf8').replace(/^register:.*$/m, 'register: 다나까체'));
  assert.equal(install(target, ['--register', '합니다체']).status, 0);
  assert.match(readFileSync(rulesPath, 'utf8'), /^register: 합니다체$/m);
});

test('다시 설치해도 작성 지침, skill, 검사기가 처음 고른 말투를 따른다', () => {
  const target = scratch();
  assert.equal(install(target, ['--register', '해요체']).status, 0);
  assert.equal(install(target).status, 0);
  const fragment = readFileSync(join(ROOT, 'skill/korean-style/register/hayo.md'), 'utf8').trim();
  for (const file of [STYLE_REL, SKILL_REL]) assert.ok(readFileSync(join(target, file), 'utf8').includes(fragment));
  assert.equal(runInstalled(target, ['--text', '확인했어요.']).status, 0);
});

test('알 수 없는 말투 이름은 파일을 쓰기 전에 거부한다', () => {
  const target = scratch();
  assert.equal(install(target, ['--register', 'typo']).status, 2);
  assert.equal(existsSync(join(target, INSTALLED_DIR)), false);
});

test('손상된 설정을 기본값으로 덮어쓰지 않는다', () => {
  const target = scratch();
  mkdirSync(join(target, '.claude'));
  const settings = join(target, '.claude/settings.json');
  writeFileSync(settings, '{broken');
  assert.equal(install(target).status, 2);
  assert.equal(readFileSync(settings, 'utf8'), '{broken');
  assert.equal(existsSync(join(target, INSTALLED_DIR)), false);
});

test('다시 설치하면 이 도구의 PreToolUse hook matcher에서 빠진 Agent를 넣는다', () => {
  const target = scratch();
  install(target);
  const path = join(target, '.claude/settings.json');
  const old = JSON.parse(readFileSync(path, 'utf8'));
  old.hooks.PreToolUse[0].matcher = old.hooks.PreToolUse[0].matcher.replace('|Agent', '');
  writeFileSync(path, JSON.stringify(old));
  install(target);
  const next = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(next.hooks.PreToolUse.length, 1);
  assert.ok(next.hooks.PreToolUse[0].matcher.split('|').includes('Agent'));
});

test('doctor는 disableAllHooks가 켜져 있으면 실패를 알린다', () => {
  const target = scratch();
  install(target);
  const path = join(target, '.claude/settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.disableAllHooks = true;
  writeFileSync(path, JSON.stringify(settings));
  const result = spawnSync('bash', [join(target, INSTALLED_DIR, 'scripts/doctor.sh')], { encoding: 'utf8', env: envFor(target) });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /disableAllHooks/);
});

test('rules.md가 이미 있으면 register 줄만 바꾼다', () => {
  /* 기존 규칙 문서를 지키면서 말투도 바꿀 수 있어야 합니다. */
  const target = scratch();
  const path = seedRules(target, '# 우리 규칙\nregister: 다나까체\nbanned-address: 당신\n');

  const r = install(target, ['--register', '해요체']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(path, 'utf-8'), '# 우리 규칙\nregister: 해요체\nbanned-address: 당신\n');
});

test('말투별 문구가 그 말투의 검사를 통과한다', () => {
  /* 말투별 문구 파일은 전체 검사에서 빠져 있습니다. */
  const rules = loadRules(rulesDocPath(ROOT));
  assert.notEqual(rules.source, null, '규칙 문서를 읽지 못했습니다');

  for (const [register, name] of Object.entries(REGISTER_FRAGMENTS)) {
    const path = join(ROOT, 'skill', 'korean-style', 'register', name);
    const violations = checkText(readFileSync(path, 'utf-8'), withRegister(rules, register), 'doc');
    assert.equal(violations.length, 0, `${name} 파일의 문구가 ${register} 규칙을 어겼습니다\n${JSON.stringify(violations, null, 2)}`);
  }
});

test('설치할 때 고른 말투의 문구를 skill에 넣는다', () => {
  const target = scratch();
  install(target, ['--register', '해요체']);

  const skill = readFileSync(join(target, SKILL_REL), 'utf-8');
  const fragment = readFileSync(join(ROOT, 'skill', 'korean-style', 'register', 'hayo.md'), 'utf-8');
  assert.ok(skill.includes(fragment.trim()), '해요체 문구가 들어가지 않았습니다');
  const formal = readFileSync(join(ROOT, 'skill', 'korean-style', 'register', 'hapnida.md'), 'utf-8').trim();
  assert.ok(!skill.includes(formal), '합니다체 문구가 남아 있습니다');

  /* 공통 절은 그대로 있어야 합니다. */
  assert.match(skill, /check-korean\.mjs --stdin/);
  assert.match(skill, /^---$/m);
});

test('말투를 고르지 않으면 기본 말투의 문구가 남는다', () => {
  const target = scratch();
  install(target);

  const skill = readFileSync(join(target, SKILL_REL), 'utf-8');
  const fragment = readFileSync(join(ROOT, 'skill', 'korean-style', 'register', 'hapnida.md'), 'utf-8');
  assert.ok(skill.includes(fragment.trim()));
});

test('--register 값에 따라 설치된 검사기의 결과가 실제로 달라진다', () => {
  /* 문서에 적힌 글자만 봐서는 부족합니다. */
  const target = scratch();
  install(target, ['--register', '해요체']);

  const r = runInstalled(target, ['--text', '이것은 확인한 결과입니다.']);
  assert.equal(r.status, 1, `해요체에서 합니다체 문장은 위반입니다. 종료 코드는 ${r.status}입니다.`);
  assert.match(r.stdout, /wrong-register/);
});

test('작성 지침 본문이 이 저장소의 규칙 검사를 통과한다', () => {
  /* 작성 지침에는 Claude가 글을 쓰기 전에 따를 원칙이 들어 있습니다. 검사기는 Claude가 쓴 글에서 금지 목록의 표현을 찾습니다. */
  const rules = loadRules(rulesDocPath(ROOT));
  assert.notEqual(rules.source, null, '규칙 문서를 읽지 못했습니다');

  const body = readFileSync(join(ROOT, 'output-styles', 'korean-style.md'), 'utf-8');
  const violations = checkText(body, rules, 'doc');
  assert.equal(violations.length, 0, `작성 지침이 이 저장소의 규칙을 어겼습니다\n${JSON.stringify(violations, null, 2)}`);
});

test('설치할 때 고른 말투의 문구를 작성 지침에도 넣는다', () => {
  /* skill과 같은 문구를 써야 합니다. */
  const target = scratch();
  const r = install(target, ['--register', '해요체']);
  assert.equal(r.status, 0, r.stderr);

  const body = readFileSync(join(target, STYLE_REL), 'utf-8');
  const fragment = readFileSync(join(ROOT, 'skill/korean-style/register/hayo.md'), 'utf8').trim();
  assert.ok(body.includes(fragment), '고른 말투의 문구가 들어가지 않았습니다');
  const formal = readFileSync(join(ROOT, 'skill/korean-style/register/hapnida.md'), 'utf8').trim();
  assert.ok(!body.includes(formal), '기본 말투의 문구가 남아 있습니다');
  assert.ok(body.includes('문장을 다듬더라도 뜻은 그대로 지킵니다'), '공통 지침이 사라졌습니다');
});

test('골라 둔 output-style이 없으면 이 도구의 작성 지침을 켠다', () => {
  /* 파일을 두기만 하고 켜지 않으면 Claude Code는 작성 지침을 시스템 프롬프트에 넣지 않습니다. */
  const { settings, set } = mergeOutputStyle({});
  assert.equal(set, true);
  assert.equal(settings.outputStyle, 'korean-style');
});

test('--activate를 주지 않으면 이미 골라 둔 output-style을 덮어쓰지 않는다', () => {
  /* 한 세션에 하나만 켜집니다. */
  const { settings, set, kept } = mergeOutputStyle({ outputStyle: 'explanatory' });
  assert.equal(set, false);
  assert.equal(kept, 'explanatory');
  assert.equal(settings.outputStyle, 'explanatory');
});

test('설치 스크립트가 settings.json에 output-style을 적고 남의 키는 지우지 않는다', () => {
  const target = scratch();
  mkdirSync(join(target, '.claude'), { recursive: true });
  writeFileSync(join(target, '.claude', 'settings.json'), JSON.stringify({ env: { A: '1' } }), 'utf-8');

  install(target);

  const settings = JSON.parse(readFileSync(join(target, '.claude', 'settings.json'), 'utf-8'));
  assert.equal(settings.outputStyle, 'korean-style');
  assert.deepEqual(settings.env, { A: '1', [PROGRESS_SUMMARY_ENV]: '0' }, '남의 키가 사라졌거나 진행 보고 요약을 끄는 값이 들어가지 않았습니다');
});

test('설치하면 프로젝트 설정에 진행 보고 요약을 끄는 값을 넣는다', () => {
  /* 이 값이 없으면 Claude가 쓴 진행 보고 일부가 서버가 요약한 문장으로 바뀌어 화면에 나옵니다. 이 문장은 skill과 검사기를 거치지 않습니다. */
  const target = scratch();
  assert.equal(install(target).status, 0);
  assert.equal(jsonAt(join(target, '.claude', 'settings.json')).env[PROGRESS_SUMMARY_ENV], '0');
  const r = doctor(target);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /통과 {2}.*진행 보고가 화면에 나오지 않습니다/);
  assert.doesNotMatch(r.stdout, /주의 {2}.*진행 보고/);
});

test('isOffValue는 Claude Code가 끔으로 읽는 값만 끄는 값으로 본다', () => {
  for (const value of ['0', 'false', 'FALSE', ' no ', 'off', 0, false]) assert.ok(isOffValue(value), `끄는 값입니다: ${JSON.stringify(value)}`);
  /* Claude Code는 이 밖의 값을 켜짐으로 읽거나 값이 없는 것으로 보고 기본값인 켜짐을 씁니다. */
  for (const value of [undefined, null, '', '1', 'true', 'on', 'disabled', 1, true]) assert.ok(!isOffValue(value), `끄는 값이 아닙니다: ${JSON.stringify(value)}`);
});

test('설치 스크립트는 프로젝트가 켜 둔 진행 보고 요약을 끄지 않고 doctor는 주의를 출력한다', () => {
  const target = scratch();
  const path = join(target, '.claude', 'settings.json');
  saveJson(path, { env: { [PROGRESS_SUMMARY_ENV]: '1' } });
  const r = install(target);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /주의: env의 .*진행 보고가 화면에 나옵니다/);
  assert.equal(jsonAt(path).env[PROGRESS_SUMMARY_ENV], '1');
  const checked = doctor(target);
  assert.equal(checked.status, 0, '진행 보고 요약이 켜진 것은 설치 실패가 아닙니다');
  assert.match(checked.stdout, /주의 {2}.*요약을 끄는 값이 아니어서.*직접 0으로/);
});

test('doctor는 진행 보고 요약을 끄는 값이 없으면 주의를 출력하고 로컬 설정의 값을 우선한다', () => {
  const target = scratch();
  assert.equal(install(target).status, 0);
  const path = join(target, '.claude', 'settings.json');
  const { env, ...rest } = jsonAt(path);
  saveJson(path, rest);
  assert.match(doctor(target).stdout, /주의 {2}env에 .*값이 없어.*다시 실행/);
  saveJson(join(target, '.claude', 'settings.local.json'), { env: { [PROGRESS_SUMMARY_ENV]: 'off' } });
  assert.match(doctor(target).stdout, /통과 {2}.*진행 보고가 화면에 나오지 않습니다/);
});

test('설치하면 Claude Code가 커밋 메시지와 PR 설명에 붙이는 생성 표시를 끈다', () => {
  const target = scratch();
  assert.equal(install(target).status, 0);
  assert.deepEqual(jsonAt(join(target, '.claude', 'settings.json')).attribution, { commit: '', pr: '' });
  const r = doctor(target);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /생성 표시/);
});

test('프로젝트 설정에 있는 attribution 값은 그대로 두고 빠진 값만 채운다', () => {
  const target = scratch();
  const path = join(target, '.claude', 'settings.json');
  saveJson(path, { attribution: { commit: 'Co-Authored-By: mikdren <bot-sidekick@nerd.kim>' } });
  assert.equal(install(target).status, 0);
  assert.deepEqual(jsonAt(path).attribution, { commit: 'Co-Authored-By: mikdren <bot-sidekick@nerd.kim>', pr: '' });
});

test('doctor는 생성 표시가 켜져 있으면 주의를 출력한다', () => {
  const target = scratch();
  assert.equal(install(target).status, 0);
  const path = join(target, '.claude', 'settings.json');
  saveJson(path, { ...jsonAt(path), attribution: { pr: '' } });
  const missing = doctor(target);
  assert.equal(missing.status, 0, '생성 표시가 켜진 것은 설치 실패가 아닙니다');
  assert.match(missing.stdout, /주의 {2}.*커밋 메시지.*생성 표시.*다시 실행/);
  saveJson(path, { ...jsonAt(path), attribution: { commit: '', pr: '🤖 Generated with [Claude Code](https://claude.com/claude-code)' } });
  assert.match(doctor(target).stdout, /주의 {2}.*생성 표시.*PR 설명.*직접/);
});

test('doctor는 사용자가 정한 공동 작성자 줄에는 주의를 출력하지 않는다', () => {
  const target = scratch();
  const path = join(target, '.claude', 'settings.json');
  saveJson(path, { attribution: { commit: 'Co-Authored-By: mikdren <bot-sidekick@nerd.kim>' } });
  assert.equal(install(target).status, 0);
  const r = doctor(target);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /생성 표시/);
});

test('설치한 프로젝트에서 doctor가 실패 없이 끝난다', () => {
  /* 구성 요소가 아무 알림 없이 꺼지는 일은 무엇보다 피해야 합니다. */
  const target = scratch();
  install(target);

  const r = spawnSync('bash', [join(target, INSTALLED_DIR, 'scripts', 'doctor.sh')], { encoding: 'utf-8' });
  assert.equal(r.status, 0, `점검이 실패로 끝났습니다\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /설치된 프로젝트/, 'doctor가 설치된 프로젝트임을 알아보지 못했습니다');
  assert.match(r.stdout, /실패 0개/, `실패가 남아 있습니다\n${r.stdout}`);
  for (const line of ['규칙 문서가 있고', '자체 검사를 통과', 'pretooluse', 'stop', 'Task', 'output-style 파일이 있습니다']) {
    assert.ok(r.stdout.includes(line), `doctor 출력에 "${line}" 문구가 없습니다\n${r.stdout}`);
  }
});

test('규칙 문서가 없으면 점검이 실패로 끝난다', () => {
  /* 통과하는 경우만 확인하면 아무것도 검사하지 않는 스크립트도 테스트를 통과합니다. */
  const target = scratch();
  install(target);
  rmSync(join(target, INSTALLED_DIR, 'rules.md'));

  const r = spawnSync('bash', [join(target, INSTALLED_DIR, 'scripts', 'doctor.sh')], { encoding: 'utf-8' });
  assert.equal(r.status, 1, `규칙 문서를 지웠는데 통과했습니다\n${r.stdout}`);
  assert.match(r.stdout, /규칙 문서가 없습니다/);
});

test('git이 작성 지침을 빼고 규칙 문서는 남긴다', () => {
  const target = gitScratch();
  install(target);

  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: target }).status === 0;
  assert.ok(ignored(STYLE_REL), '작성 지침이 커밋 대상입니다');
  assert.ok(!ignored(join(INSTALLED_DIR, 'rules.md')), '규칙 문서가 Git에서 제외되었습니다');
});

test('--dry-run을 주면 아무것도 쓰지 않는다', () => {
  const target = scratch();
  const r = install(target, ['--dry-run']);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(target, INSTALLED_DIR)));
  assert.ok(!existsSync(join(target, '.claude')));
});

test('이 도구의 저장소에는 설치하지 않는다', () => {
  /* 설치하면 기준이 되는 규칙 문서가 둘이 됩니다. */
  const r = install(ROOT);

  assert.equal(r.status, 2);
  assert.ok(!existsSync(join(ROOT, INSTALLED_DIR)));
});

test('없는 대상 경로에는 설치하지 않는다', () => {
  const r = install(join(scratch(), '없는-자리'));

  assert.equal(r.status, 2);
});

test('settings.json이 가리키는 hook 파일이 실제로 있다', () => {
  /* 설정의 hook 경로와 실제 파일 위치가 어긋나면 Claude Code가 없는 파일을 실행하려 합니다. */
  const target = scratch();
  install(target);

  const settings = JSON.parse(readFileSync(join(target, '.claude', 'settings.json'), 'utf-8'));
  const commands = Object.values(settings.hooks).flatMap((list) =>
    list.flatMap((entry) => entry.hooks.map((h) => h.command)),
  );
  assert.equal(commands.length, 3);

  for (const command of commands) {
    const quoted = command.match(/"([^"]+)"/);
    assert.ok(quoted !== null, `명령에서 경로를 찾지 못했습니다: ${command}`);
    const path = quoted[1].replace('$CLAUDE_PROJECT_DIR', target);
    assert.ok(existsSync(path), `hook 설정은 있는데 파일이 없습니다: ${path}`);
  }
});

test('두 번 설치해도 settings.json의 hook 항목이 이벤트마다 하나다', () => {
  const target = scratch();
  install(target);
  install(target);

  const settings = JSON.parse(readFileSync(join(target, '.claude', 'settings.json'), 'utf-8'));
  assert.equal(settings.hooks.PreToolUse.length, 1);
  assert.equal(settings.hooks.Stop.length, 1);
});

test('원래 있던 설정을 지우지 않는다', () => {
  const target = scratch();
  const settingsPath = join(target, '.claude', 'settings.json');
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(
    settingsPath,
    JSON.stringify({
      env: { FOO: 'bar' },
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo 남의 hook' }] }] },
    }),
    'utf-8',
  );

  install(target);

  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  assert.equal(settings.env.FOO, 'bar');
  assert.equal(settings.hooks.Stop.length, 2);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'echo 남의 hook');
});

test('git 저장소에 설치하면 gitignore에 줄이 생긴다', () => {
  const target = gitScratch();
  const r = install(target);
  assert.equal(r.status, 0, r.stderr);

  const ignore = readFileSync(join(target, '.gitignore'), 'utf-8');
  assert.ok(ignore.includes(`${INSTALLED_DIR}/*`), '설치 디렉터리를 빼는 줄이 없습니다');
  assert.ok(ignore.includes(`!${INSTALLED_DIR}/rules.md`), '규칙 문서를 남기는 줄이 없습니다');
  assert.ok(ignore.includes('.claude/skills/korean-style/'), 'skill을 빼는 줄이 없습니다');
});

test('설치할 때 복사한 파일은 git이 실제로 빼고 규칙 문서와 hook 설정은 남긴다', () => {
  /* 줄이 있는지만 봐서는 부족합니다. */
  const target = gitScratch();
  install(target);

  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: target }).status === 0;

  assert.ok(ignored(join(INSTALLED_DIR, 'scripts', 'check-korean.mjs')), '검사기가 커밋 대상입니다');
  assert.ok(ignored(join(INSTALLED_DIR, 'docs', 'limits.md')), '제약 문서가 커밋 대상입니다');
  assert.ok(ignored(SKILL_REL), 'skill이 커밋 대상입니다');

  /* 이 둘은 설치한 프로젝트에서 커밋할 파일입니다. */
  assert.ok(!ignored(join(INSTALLED_DIR, 'rules.md')), '규칙 문서가 Git에서 제외되었습니다');
  assert.ok(!ignored(join('.claude', 'settings.json')), 'hook 설정 파일이 Git에서 제외되었습니다');
});

test('두 번 설치해도 gitignore 줄이 쌓이지 않는다', () => {
  const target = gitScratch();
  install(target);
  install(target);

  const lines = readFileSync(join(target, '.gitignore'), 'utf-8').split('\n');
  assert.equal(lines.filter((line) => line === `${INSTALLED_DIR}/*`).length, 1);
});

test('원래 있던 gitignore 줄을 지우지 않는다', () => {
  const target = gitScratch();
  writeFileSync(join(target, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8');

  install(target);

  const ignore = readFileSync(join(target, '.gitignore'), 'utf-8');
  assert.ok(ignore.startsWith('node_modules/\ndist/\n'), '남의 줄이 사라졌습니다');
  assert.ok(ignore.includes(`${INSTALLED_DIR}/*`));
});

/* 0.2.1까지 .gitignore에 쓰던 주석입니다. */
const OLD_GITIGNORE_COMMENTS = [
  '# korean-style 설치 산출물입니다. rules.md만 이 프로젝트의 것입니다',
  '# korean-style이 설치한 파일입니다. 직접 고치는 파일은 rules.md뿐입니다',
];

test('회귀: 예전 버전에서 gitignore에 쓰던 주석은 다시 설치하면 새 문구로 바뀌고 한 줄만 남는다', () => {
  for (const old of OLD_GITIGNORE_COMMENTS) {
    const target = gitScratch();
    writeFileSync(join(target, '.gitignore'), `node_modules/\n\n${old}\n${INSTALLED_DIR}/*\n`, 'utf-8');

    install(target);

    const lines = readFileSync(join(target, '.gitignore'), 'utf-8').split('\n');
    assert.equal(lines[0], 'node_modules/', '남의 줄이 바뀌었습니다');
    assert.ok(!lines.includes(old), `예전 주석이 남았습니다: ${old}`);
    assert.equal(lines.filter((line) => line.startsWith('# korean-style')).length, 1, '이 도구의 주석 줄이 정확히 하나여야 합니다');
    assert.equal(lines.filter((line) => line === `${INSTALLED_DIR}/*`).length, 1);
    assert.ok(lines.includes(`!${INSTALLED_DIR}/rules.md`), '빠진 줄을 추가하지 않았습니다');
  }
});

test('이 도구의 주석과 비슷하기만 한 주석은 바꾸지 않는다', () => {
  for (const old of OLD_GITIGNORE_COMMENTS) {
    const target = gitScratch();
    const mine = `${old} (직접 관리)\n${INSTALLED_DIR}/\n`;
    writeFileSync(join(target, '.gitignore'), mine, 'utf-8');

    install(target);

    assert.equal(readFileSync(join(target, '.gitignore'), 'utf-8'), mine);
  }
});

test('이 도구 경로를 직접 적어 둔 gitignore는 손대지 않는다', () => {
  /* 사용자가 직접 적어 둔 줄입니다. */
  const target = gitScratch();
  const mine = `# 우리가 정했습니다\n${INSTALLED_DIR}/\n`;
  writeFileSync(join(target, '.gitignore'), mine, 'utf-8');

  install(target);

  assert.equal(readFileSync(join(target, '.gitignore'), 'utf-8'), mine);
});

test('git 저장소가 아니면 gitignore와 .worktreeinclude를 만들지 않는다', () => {
  /* 아무것도 막지 못하는 파일을 남기면 사용자는 이 도구가 무언가를 보장한다고 오해합니다. */
  const target = scratch();
  const r = install(target);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(target, '.gitignore')));
  assert.ok(!existsSync(join(target, '.worktreeinclude')));
  assert.match(r.stdout, /\.git이 없어서/);
});

test('--dry-run을 주면 gitignore와 .worktreeinclude도 만들지 않는다', () => {
  const target = gitScratch();
  const r = install(target, ['--dry-run']);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(target, '.gitignore')));
  assert.ok(!existsSync(join(target, '.worktreeinclude')));
});

test('설치된 검사기가 자체 검사를 통과한다', () => {
  const target = scratch();
  install(target);

  const r = runInstalled(target, ['--self-check']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /자체 검사 통과/);
});

test('회귀: 설치할 때 어느 말투를 골라도 자체 검사를 통과한다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  for (const register of ['합니다체', '해요체', '혼용']) {
    const target = scratch();
    install(target, ['--register', register]);

    const r = runInstalled(target, ['--self-check']);
    assert.equal(r.status, 0, `${register} 말투를 골라 설치했을 때 자체 검사가 실패했습니다\n${r.stdout}`);
  }
});

test('설치된 검사기가 프로젝트 문서의 위반을 잡는다', () => {
  const target = scratch();
  mkdirSync(join(target, 'docs'), { recursive: true });
  writeFileSync(join(target, 'docs', 'bad.md'), '# 안내\n\n결과가 보여집니다.\n', 'utf-8');
  writeFileSync(join(target, 'docs', 'good.md'), '# 안내\n\n결과가 보입니다.\n', 'utf-8');
  install(target);

  const r = runInstalled(target, ['--all']);
  assert.equal(r.status, 1, `심어 둔 위반을 잡아야 합니다. 종료 코드는 ${r.status}입니다.`);
  assert.match(r.stdout, /double-passive/);
  assert.match(r.stdout, /bad\.md/);

  /* 설치 스크립트가 복사한 파일은 세지 않습니다. */
  assert.match(r.stdout, /파일 2개/);
});

test('설치된 hook이 규칙을 어긴 글은 쓰지 못하게 막는다', () => {
  const target = scratch();
  install(target);

  const out = runInstalledHook(target, {
    tool_name: 'Write',
    tool_input: { file_path: join(target, 'docs', 'bad.md'), content: '# 제목\n\n결과가 보여집니다.\n' },
    cwd: target,
  });

  assert.notEqual(out, null, 'hook이 아무것도 출력하지 않았습니다');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /double-passive/);
});

test('설치된 hook이 규칙을 지킨 글은 막지 않는다', () => {
  /* 규칙을 어긴 글을 잡는 것보다 규칙을 지킨 글을 막지 않는 것이 더 중요합니다. */
  const target = scratch();
  install(target);

  const out = runInstalledHook(target, {
    tool_name: 'Write',
    tool_input: { file_path: join(target, 'docs', 'good.md'), content: '# 제목\n\n결과가 보입니다.\n' },
    cwd: target,
  });

  assert.equal(out, null);
});

test('설치된 hook은 새로 쓴 글에 영어식 표현으로 보이는 곳이 있으면 쓰기를 막지 않고 Claude에게 알린다', () => {
  /* 설치된 규칙 문서에 review-rules가 들어가지 않으면 이 알림은 아무 표시 없이 꺼집니다. */
  const target = scratch();
  install(target);

  const out = runInstalledHook(target, {
    tool_name: 'Write',
    tool_input: { file_path: join(target, 'docs', 'note.md'), content: '# 제목\n\n로그를 통해 원인을 찾았습니다.\n' },
    cwd: target,
  });

  assert.notEqual(out, null, 'hook이 아무것도 출력하지 않았습니다');
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  assert.match(out.hookSpecificOutput.additionalContext, /\[translationese\] 3줄/);
});

const jsonAt = path => JSON.parse(readFileSync(path, 'utf8'));
const saveJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value)); };
const doctor = target => spawnSync('node', [join(target, INSTALLED_DIR, 'scripts/doctor.mjs')], { encoding: 'utf8', env: envFor(ROOT) });
const git = (target, args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
  { cwd: target, encoding: 'utf8', env: envFor(ROOT) });

test('Claude 세션 안에서도 현재 프로젝트에 설치할 수 있고 이 도구의 저장소를 가리키는 symlink에는 설치하지 않는다', () => {
  const target = scratch();
  const r = spawnSync('node', [join(ROOT, 'scripts/install.mjs'), '--target', target], { encoding: 'utf8', env: envFor(target) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(doctor(target).status, 0);
  const alias = join(scratch(), 'source');
  symlinkSync(ROOT, alias);
  assert.equal(install(alias).status, 2);
});

test('잘못된 옵션과 형식이 틀린 hook 설정은 파일을 바꾸기 전에 거부한다', () => {
  for (const extra of [['--unknown'], ['--register'], ['--target']]) {
    const target = scratch();
    assert.equal(install(target, extra).status, 2);
    assert.deepEqual(readdirSync(target), []);
  }
  for (const name of ['settings.json', 'settings.local.json']) {
    const target = scratch();
    const path = join(target, '.claude', name);
    saveJson(path, { hooks: { Stop: [{ hooks: 'invalid' }] } });
    const before = readFileSync(path, 'utf8');
    assert.equal(install(target).status, 2);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.ok(!existsSync(join(target, INSTALLED_DIR)));
  }
});

test('이름이 같은 기존 output-style을 덮어쓰지 않고 프로젝트 밖을 가리키는 symlink를 따라가 쓰지도 않는다', () => {
  for (const link of [false, true]) {
    const target = scratch(), external = scratch();
    if (link) symlinkSync(external, join(target, '.claude'));
    else { mkdirSync(dirname(join(target, STYLE_REL)), { recursive: true }); writeFileSync(join(target, STYLE_REL), '기존 지침'); }
    assert.equal(install(target).status, 2);
    assert.ok(!existsSync(join(target, INSTALLED_DIR)));
    if (link) assert.deepEqual(readdirSync(external), []);
    else assert.equal(readFileSync(join(target, STYLE_REL), 'utf8'), '기존 지침');
  }
});

test('고치지 않은 예전 기본 규칙만 새 규칙으로 바꾸고 사용자가 고른 말투와 직접 고친 규칙은 그대로 둔다', () => {
  const target = scratch();
  assert.equal(install(target, ['--register', '해요체']).status, 0);
  const rulesPath = join(target, INSTALLED_DIR, 'rules.md');
  const current = readFileSync(rulesPath, 'utf8');
  const previous = current.replace('banned-char: middot,', 'banned-char:');
  writeFileSync(rulesPath, previous);
  writeFileSync(join(target, INSTALLED_DIR, 'defaults.sha256'), createHash('sha256').update(previous.replace(/^register:.*$/m, 'register:')).digest('hex'));
  assert.equal(install(target).status, 0);
  assert.equal(readFileSync(rulesPath, 'utf8'), current);
  assert.equal(runInstalled(target, ['--text', 'API\u00b7DB예요.']).status, 1);
  const custom = current.replace('max-sentence-chars: 110', 'max-sentence-chars: 200');
  writeFileSync(rulesPath, custom);
  assert.equal(install(target).status, 0);
  assert.equal(readFileSync(rulesPath, 'utf8'), custom);
  assert.equal(install(target, ['--force']).status, 0);
  assert.equal(readFileSync(rulesPath, 'utf8'), current);
  const backup = readdirSync(join(target, INSTALLED_DIR)).find(n => n.startsWith('rules.backup-'));
  assert.equal(readFileSync(join(target, INSTALLED_DIR, backup), 'utf8'), custom);
});

test('--activate를 주면 프로젝트 설정의 outputStyle만 바꾸고 다른 설정 키와 로컬 설정은 유지한다', () => {
  const target = scratch();
  const path = join(target, '.claude/settings.json');
  const local = join(target, '.claude/settings.local.json');
  saveJson(path, { outputStyle: 'custom', env: { KEEP: '1' } });
  saveJson(local, { outputStyle: 'local-custom', disableAllHooks: true });
  assert.equal(install(target, ['--activate']).status, 0);
  assert.equal(jsonAt(path).outputStyle, 'korean-style');
  assert.deepEqual(jsonAt(path).env, { KEEP: '1', [PROGRESS_SUMMARY_ENV]: '0' });
  assert.equal(jsonAt(local).outputStyle, 'local-custom');
  const r = doctor(target);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /disableAllHooks/);
  assert.match(r.stdout, /local-custom/);
  rmSync(local);
  assert.equal(doctor(target).status, 0);
});

test('다시 설치하면 사용자 hook 항목의 matcher는 넓히지 않고 이 도구의 항목만 복구한다', () => {
  const target = scratch();
  install(target);
  const path = join(target, '.claude/settings.json');
  const settings = jsonAt(path);
  const own = settings.hooks.PreToolUse[0].hooks[0];
  settings.hooks.PreToolUse = [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo custom' }, own] },
    { matcher: 'Edit', hooks: [own] }];
  saveJson(path, settings);
  assert.equal(install(target).status, 0);
  const entries = jsonAt(path).hooks.PreToolUse;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].matcher, 'Write');
  assert.deepEqual(entries[0].hooks, [{ type: 'command', command: 'echo custom' }]);
  assert.ok(entries[1].matcher.includes('Agent'));
  assert.equal(doctor(target).status, 0);
});

test('doctor는 hook이 다른 이벤트에 있거나 파일 이름만 같은 엉뚱한 명령이면 통과시키지 않는다', () => {
  const target = scratch();
  install(target);
  const path = join(target, '.claude/settings.json');
  const settings = jsonAt(path);
  settings.hooks.Stop[0].hooks.push(settings.hooks.PreToolUse[0].hooks[0]);
  settings.hooks.PreToolUse[0].hooks[0] = { type: 'command', command: 'echo pretooluse.mjs' };
  saveJson(path, settings);
  const r = doctor(target);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PreToolUse에 올바른 pretooluse/);
});

test('core.hooksPath를 따로 지정해도 실제 git commit을 검사하고 남이 건 hook은 덮어쓰지 않는다', () => {
  const target = gitScratch();
  assert.equal(git(target, ['config', 'core.hooksPath', 'hooks with spaces']).status, 0);
  assert.equal(install(target).status, 0);
  assert.ok(existsSync(join(target, 'hooks with spaces/commit-msg')));
  assert.equal(doctor(target).status, 0);
  assert.notEqual(git(target, ['commit', '--allow-empty', '-m', '확인했어요.']).status, 0);
  assert.equal(git(target, ['commit', '--allow-empty', '-m', '확인했습니다.']).status, 0);
  const path = join(target, 'hooks with spaces/commit-msg');
  const mine = '#!/bin/sh\nexit 0\n';
  writeFileSync(path, mine);
  const result = spawnSync('node', [join(target, INSTALLED_DIR, 'scripts/doctor.mjs'), '--install-commit-hook'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(readFileSync(path, 'utf8'), mine);
});

test('작업 트리끼리 같이 쓰는 hook은 커밋하는 작업 트리의 규칙을 따른다', () => {
  const target = gitScratch();
  assert.equal(git(target, ['commit', '--allow-empty', '-m', 'init']).status, 0);
  const worktree = join(scratch(), '한글 worktree');
  const added = git(target, ['worktree', 'add', '-q', '-b', 'test-style', worktree]);
  assert.equal(added.status, 0, added.stderr);
  assert.equal(install(target).status, 0);
  assert.equal(install(worktree, ['--register', '해요체']).status, 0);
  assert.equal(doctor(worktree).status, 0);
  assert.equal(git(worktree, ['commit', '--allow-empty', '-m', '확인했어요.']).status, 0);
  assert.notEqual(git(target, ['commit', '--allow-empty', '-m', '확인했어요.']).status, 0);
  saveJson(join(target, '.claude/settings.local.json'), { disableAllHooks: true });
  assert.equal(doctor(worktree).status, 1);
});

test('이 도구가 건 hook의 symlink가 끊어지면 복구하고 다른 곳을 가리키는 symlink는 그대로 둔다', () => {
  const target = gitScratch();
  install(target);
  const path = join(target, '.git/hooks/commit-msg');
  rmSync(path);
  symlinkSync('../../missing/.korean-style/scripts/hooks/commit-msg.mjs', path);
  assert.equal(doctor(target).status, 1);
  assert.equal(install(target).status, 0);
  assert.equal(doctor(target).status, 0);
  rmSync(path);
  symlinkSync('../../external-missing', path);
  install(target);
  assert.equal(doctor(target).status, 1);
});

test('나중에 git init한 뒤 다시 설치해도 동작하고 clone한 프로젝트에서도 다시 설치할 수 있다', () => {
  const target = scratch();
  assert.equal(install(target, ['--register', '해요체']).status, 0);
  assert.equal(git(target, ['init', '-q']).status, 0);
  assert.equal(install(target).status, 0);
  for (const path of ['.korean-style/rules.md', '.korean-style/defaults.sha256', '.claude/settings.json']) {
    assert.notEqual(git(target, ['check-ignore', '-q', path]).status, 0);
  }
  assert.equal(git(target, ['add', '.gitignore', '.korean-style/rules.md', '.korean-style/defaults.sha256', '.claude/settings.json']).status, 0);
  assert.equal(git(target, ['commit', '-m', '설치했어요.']).status, 0);
  const cloned = join(scratch(), 'clone');
  assert.equal(git(target, ['clone', '-q', target, cloned]).status, 0);
  assert.ok(!existsSync(join(cloned, INSTALLED_DIR, 'scripts')));
  assert.equal(install(cloned).status, 0);
  assert.equal(doctor(cloned).status, 0);
  assert.equal(runInstalled(cloned, ['--text', '확인했어요.']).status, 0);
});

/* settings.json에 적힌 hook 명령을 Claude Code처럼 shell로 실행합니다. */
function runHookCommand(target, event, input = {}) {
  const command = jsonAt(join(target, '.claude', 'settings.json')).hooks[event][0].hooks[0].command;
  return spawnSync('sh', ['-c', command], { input: JSON.stringify(input), encoding: 'utf-8', cwd: target, env: envFor(target) });
}

test('회귀: clone한 직후 설치 명령을 실행하기 전에도 hook이 실패하지 않고 다시 설치하라는 안내를 남긴다', () => {
  /* 설치 스크립트가 복사한 hook 스크립트는 Git에서 제외되므로 새로 clone한 저장소에는 없습니다. 예전에는 hook 셋이 이벤트마다 "Cannot find module"로 실패했습니다. */
  const target = gitScratch();
  assert.equal(install(target).status, 0);
  assert.equal(git(target, ['add', '.gitignore', '.worktreeinclude', '.korean-style/rules.md', '.korean-style/defaults.sha256', '.claude/settings.json']).status, 0);
  assert.equal(git(target, ['commit', '-q', '-m', '설치했습니다.']).status, 0);
  const cloned = join(scratch(), 'clone');
  assert.equal(git(target, ['clone', '-q', target, cloned]).status, 0);
  assert.ok(!existsSync(join(cloned, INSTALLED_DIR, 'scripts')));

  for (const event of ['UserPromptSubmit', 'PreToolUse', 'Stop']) {
    const r = runHookCommand(cloned, event);
    assert.equal(r.status, 0, `${event} hook의 종료 코드가 ${r.status}입니다: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /Cannot find module/);
    assert.equal(r.stdout.trim(), event === 'UserPromptSubmit' ? MISSING_SCRIPTS_NOTICE : '');
  }
});

test('hook 스크립트가 있으면 hook 명령이 스크립트를 실행하고 그 결과를 그대로 넘긴다', () => {
  const target = scratch();
  install(target);

  const r = runHookCommand(target, 'PreToolUse', {
    tool_name: 'Write',
    tool_input: { file_path: join(target, 'docs', 'bad.md'), content: '# 제목\n\n결과가 보여집니다.\n' },
    cwd: target,
  });

  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('0.3.3까지 설치한 hook 명령은 다시 설치하면 새 명령으로 바뀌고 이벤트마다 하나만 남는다', () => {
  const target = scratch();
  const old = name => `node "$CLAUDE_PROJECT_DIR/${INSTALLED_DIR}/scripts/hooks/${name}.mjs"`;
  saveJson(join(target, '.claude', 'settings.json'), { hooks: {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: old('userprompt') }] }],
    PreToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: old('pretooluse') }] }],
    Stop: [{ hooks: [{ type: 'command', command: old('stop') }] }],
  } });

  assert.equal(install(target).status, 0);
  const settings = jsonAt(join(target, '.claude', 'settings.json'));
  for (const [event, name] of [['UserPromptSubmit', 'userprompt'], ['PreToolUse', 'pretooluse'], ['Stop', 'stop']]) {
    assert.deepEqual(settings.hooks[event].flatMap(entry => entry.hooks.map(h => h.command)), [hookCommand(name)]);
  }
  assert.equal(doctor(target).status, 0);
});

test('git 저장소에 설치하면 작업 트리에 복사할 설치 파일을 .worktreeinclude에 적고 다시 설치해도 줄이 쌓이지 않는다', () => {
  /* Claude Code는 `claude --worktree`로 작업 트리를 만들 때 Git에서 제외된 파일 가운데 .worktreeinclude의 패턴에 맞는 파일만 복사합니다. */
  const target = gitScratch();
  writeFileSync(join(target, '.worktreeinclude'), '.env\n');
  assert.equal(install(target).status, 0);
  assert.equal(install(target).status, 0);

  const text = readFileSync(join(target, '.worktreeinclude'), 'utf-8');
  assert.ok(text.startsWith('.env\n'), '프로젝트에 있던 줄이 지워졌습니다');
  assert.equal(text.split('\n').filter(line => line === `${INSTALLED_DIR}/*`).length, 1);

  const listed = args => git(target, ['ls-files', '--others', '--ignored', ...args]).stdout.split('\n').filter(Boolean);
  const included = new Set(listed([`--exclude-from=${join(target, '.worktreeinclude')}`]));
  const copied = listed(['--exclude-standard']).filter(path => included.has(path));
  for (const path of [
    `${INSTALLED_DIR}/scripts/hooks/userprompt.mjs`,
    `${INSTALLED_DIR}/scripts/hooks/pretooluse.mjs`,
    `${INSTALLED_DIR}/scripts/hooks/stop.mjs`,
    '.claude/skills/korean-rewrite/SKILL.md',
    '.claude/skills/korean-style/SKILL.md',
    '.claude/output-styles/korean-style.md',
  ]) assert.ok(copied.includes(path), `작업 트리에 복사되지 않는 파일입니다: ${path}`);
  assert.ok(!copied.includes(`${INSTALLED_DIR}/rules.md`));
});

test('README의 shell 설치 명령을 새 프로젝트와 기존 프로젝트에서 그대로 실행한다', () => {
  const source = gitScratch();
  for (const path of ['scripts', 'docs', 'skill', 'output-styles', 'LICENSE', 'package.json']) {
    cpSync(join(ROOT, path), join(source, path), { recursive: true });
  }
  assert.equal(git(source, ['add', '.']).status, 0);
  assert.equal(git(source, ['commit', '-qm', 'fixture']).status, 0);
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8').match(/```sh\n([\s\S]*?)\n```/)[1];
  /* GitHub 대신 이 저장소의 파일을 복사해 커밋한 임시 저장소를 npx로 받습니다. 받은 패키지에는 package.json의 `files`에 적힌 파일만 들어 있습니다. */
  const instructions = readme.replace(/github:[\w.-]+\/[\w.-]+/, `git+file://${source}`);
  assert.notEqual(instructions, readme, 'README의 첫 설치 명령이 npx 형식이 아닙니다');
  const npmEnv = { npm_config_cache: join(scratch(), 'npm-cache'), npm_config_update_notifier: 'false',
    npm_config_fund: 'false', npm_config_audit: 'false' };
  for (const existing of [false, true]) {
    const target = join(scratch(), "프로젝트 ' $값");
    mkdirSync(target);
    if (existing) {
      assert.equal(git(target, ['init', '-q']).status, 0);
      writeFileSync(join(target, 'CLAUDE.md'), '# 기존 지침입니다\n');
      saveJson(join(target, '.claude/settings.json'), { outputStyle: 'custom', env: { KEEP: '1' } });
    }
    const r = spawnSync('bash', ['-c', instructions], { cwd: target, encoding: 'utf8', env: { ...envFor(target), ...npmEnv } });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.equal(doctor(target).status, 0);
    assert.equal(jsonAt(join(target, '.claude/settings.json')).outputStyle, 'korean-style');
    if (existing) {
      assert.equal(readFileSync(join(target, 'CLAUDE.md'), 'utf8'), '# 기존 지침입니다\n');
      assert.deepEqual(jsonAt(join(target, '.claude/settings.json')).env, { KEEP: '1', [PROGRESS_SUMMARY_ENV]: '0' });
    }
  }
});

test('사용자가 규칙을 바꿔도 자체 검사는 통과하고 실제 검사는 바꾼 규칙을 따른다', () => {
  const target = scratch();
  install(target);
  const path = join(target, INSTALLED_DIR, 'rules.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^banned-char:.*$/m, 'banned-char: emoji'));
  assert.equal(runInstalled(target, ['--self-check']).status, 0);
  assert.equal(doctor(target).status, 0);
  assert.equal(runInstalled(target, ['--text', 'API\u00b7DB를 확인합니다.']).status, 0);
  assert.equal(install(target).status, 0);
  assert.equal(doctor(target).status, 0);
});

test('doctor는 규칙에 review-rules가 빠져 있으면 주의를 출력하고 기본 규칙이면 출력하지 않는다', () => {
  /* 직접 고친 규칙은 다시 설치해도 새 키가 들어가지 않으므로 경고 알림이 꺼진 채 남습니다. */
  const target = scratch();
  install(target);
  assert.doesNotMatch(doctor(target).stdout, /review-rules/);
  const path = join(target, INSTALLED_DIR, 'rules.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^review-rules:.*\n/m, ''));
  const r = doctor(target);
  assert.equal(r.status, 0, '알림이 꺼진 것은 설치 실패가 아닙니다');
  assert.match(r.stdout, /주의 {2}review-rules가 없거나 비어 있어/);
  writeFileSync(path, `${readFileSync(path, 'utf8').replace('```korean-style-rules\n', '```korean-style-rules\nreview-rules: translationese, translationeze\n')}`);
  assert.match(doctor(target).stdout, /review-rules의 다음 이름은 advisory-rules에 없어서 hook이 알리지 않습니다: translationeze$/m);
});

test('doctor는 말투나 금지 문자 종류를 해석하지 못하면 성공했다고 보고하지 않는다', () => {
  const target = scratch();
  install(target);
  const path = join(target, INSTALLED_DIR, 'rules.md');
  const body = readFileSync(path, 'utf8');
  for (const changed of [body.replace('register: 합니다체', 'register: unknown'), body.replace('banned-char: middot,', 'banned-char: unknown,')]) {
    writeFileSync(path, changed);
    const r = doctor(target);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /알 수 없는/);
  }
});
