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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* skill을 설치할 경로입니다. */
const SKILL_REL = join('.claude', 'skills', 'korean-style', 'SKILL.md');

/* output-style을 설치할 경로입니다. */
const STYLE_REL = join('.claude', 'output-styles', 'korean-style.md');

/* 대상 프로젝트가 될 빈 디렉터리입니다. */
const temporary = [];
const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), 'korean-style-install-'));
  temporary.push(root);
  return root;
};
after(() => temporary.forEach(path => rmSync(path, { recursive: true, force: true })));

/* git 저장소인 대상입니다. */
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

/* 설치된 검사기를 대상 안에서 띄웁니다. */
function runInstalled(target, args) {
  return spawnSync('node', [join(target, INSTALLED_DIR, 'scripts', 'check-korean.mjs'), ...args], {
    encoding: 'utf-8',
    cwd: target,
    env: envFor(target),
  });
}

/* 설치된 hook을 대상 안에서 띄우고 stdout을 JSON으로 읽습니다. */
function runInstalledHook(target, input) {
  const r = spawnSync('node', [join(target, INSTALLED_DIR, 'scripts', 'hooks', 'pretooluse.mjs')], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    cwd: target,
    env: envFor(target),
  });
  assert.equal(r.status, 0, `hook은 언제나 종료 코드 0으로 끝나야 합니다. 나온 값은 ${r.status}입니다`);
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

test('설치가 파일을 제자리에 놓는다', () => {
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
    assert.ok(ignored.includes(`.claude/skills/${name}/`), `${name}이 gitignore에 있어야 합니다`);
  }
});

test('korean-rewrite skill이 이 저장소의 규칙 검사를 통과한다', () => {
  /* 자기 규칙을 어기는 지침은 사용자가 곧바로 꺼 버립니다. */
  const rules = loadRules(rulesDocPath(ROOT));
  const body = readFileSync(join(ROOT, 'skill', 'korean-rewrite', 'SKILL.md'), 'utf-8');
  const violations = checkText(body, rules, 'doc');
  assert.equal(violations.length, 0, `위반이 있습니다: ${JSON.stringify(violations.slice(0, 3))}`);
});

/* 커밋 메시지 hook입니다. 전에는 설치 스크립트가 명령을 화면에 출력하기만 했습니다. */

test('설치가 커밋 메시지 hook을 실제로 건다', () => {
  const target = gitScratch();
  install(target);
  const hook = join(target, '.git', 'hooks', 'commit-msg');
  assert.ok(existsSync(hook), 'hook이 걸려야 합니다');
  /* symlink가 끊겨 있으면 git이 조용히 건너뜁니다. */
  assert.ok(existsSync(realpathSync(hook)), 'symlink가 실제 파일을 가리켜야 합니다');
});

test('설치된 커밋 메시지 hook이 규칙을 어긴 메시지를 막는다', () => {
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

test('대상에 이미 있는 commit-msg를 덮어쓰지 않는다', () => {
  const target = gitScratch();
  const hooksDir = join(target, '.git', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const hook = join(hooksDir, 'commit-msg');
  writeFileSync(hook, '#!/bin/sh\nexit 0\n', 'utf-8');
  install(target);
  assert.match(readFileSync(hook, 'utf-8'), /exit 0/, '남의 hook을 지우면 설치가 그 프로젝트에 해를 끼칩니다');
});

test('두 번 설치해도 커밋 메시지 hook이 하나다', () => {
  const target = gitScratch();
  install(target);
  const first = realpathSync(join(target, '.git', 'hooks', 'commit-msg'));
  install(target);
  assert.equal(realpathSync(join(target, '.git', 'hooks', 'commit-msg')), first);
});

test('git 저장소가 아니면 커밋 메시지 hook을 걸지 않는다', () => {
  const target = scratch();
  install(target);
  assert.ok(!existsSync(join(target, '.git')), 'git 디렉터리를 만들면 안 됩니다');
});

test('dry-run은 커밋 메시지 hook을 걸지 않는다', () => {
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

test('설치 스크립트 자신은 대상에 복사되지 않는다', () => {
  /* 설치된 곳에서 또 설치할 일이 없습니다. */
  const target = scratch();
  install(target);

  assert.ok(!existsSync(join(target, INSTALLED_DIR, 'scripts', 'install.mjs')));
});

test('이미 있는 rules.md를 덮어쓰지 않는다', () => {
  const target = scratch();
  const mine = '# 이 프로젝트가 고친 규칙입니다\nregister: 다나까체\nbanned-address: 당신\n';
  const path = seedRules(target, mine);

  const r = install(target);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(path, 'utf-8'), mine);
});

test('force를 주면 rules.md를 덮어쓴다', () => {
  const target = scratch();
  const path = seedRules(target, '# 지워질 규칙입니다\nregister: 다나까체\n');

  const r = install(target, ['--force']);
  assert.equal(r.status, 0, r.stderr);
  const after = readFileSync(path, 'utf-8');
  assert.ok(!after.includes('지워질 규칙입니다'));
  assert.match(after, /^register: /m);
});

test('register 값이 규칙 문서에 반영된다', () => {
  const target = scratch();
  const r = install(target, ['--register', '해요체']);
  assert.equal(r.status, 0, r.stderr);

  const rules = readFileSync(join(target, INSTALLED_DIR, 'rules.md'), 'utf-8');
  assert.match(rules, /^register: 해요체$/m);
  assert.ok(!/^register: 다나까체$/m.test(rules));
});

test('register를 주지 않으면 기본 어투가 남는다', () => {
  const target = scratch();
  install(target);

  const rules = readFileSync(join(target, INSTALLED_DIR, 'rules.md'), 'utf-8');
  assert.match(rules, /^register: 다나까체$/m);
});

test('재설치해도 지침과 검사기 모두 기존 어투를 유지한다', () => {
  const target = scratch();
  assert.equal(install(target, ['--register', '해요체']).status, 0);
  assert.equal(install(target).status, 0);
  const fragment = readFileSync(join(ROOT, 'skill/korean-style/register/hayo.md'), 'utf8').trim();
  for (const file of [STYLE_REL, SKILL_REL]) assert.ok(readFileSync(join(target, file), 'utf8').includes(fragment));
  assert.equal(runInstalled(target, ['--text', '확인했어요.']).status, 0);
});

test('잘못된 어투는 파일을 쓰기 전에 거부한다', () => {
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

test('재설치하면 기존 hook에 Agent matcher를 더한다', () => {
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

test('doctor는 disableAllHooks 설정을 실패로 보고한다', () => {
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
  /* 기존 규칙 문서를 지키면서 어투도 바꿀 수 있어야 합니다. */
  const target = scratch();
  const path = seedRules(target, '# 우리 규칙\nregister: 다나까체\nbanned-address: 당신\n');

  const r = install(target, ['--register', '해요체']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(path, 'utf-8'), '# 우리 규칙\nregister: 해요체\nbanned-address: 당신\n');
});

test('어투 조각이 자기 어투를 지킨다', () => {
  /* 이 조각들은 전체 검사에서 빠져 있습니다. */
  const rules = loadRules(rulesDocPath(ROOT));
  assert.notEqual(rules.source, null, '규칙 문서를 읽지 못했습니다');

  for (const [register, name] of Object.entries(REGISTER_FRAGMENTS)) {
    const path = join(ROOT, 'skill', 'korean-style', 'register', name);
    const violations = checkText(readFileSync(path, 'utf-8'), withRegister(rules, register), 'doc');
    assert.equal(violations.length, 0, `${name}가 ${register}를 어겼습니다\n${JSON.stringify(violations, null, 2)}`);
  }
});

test('설치할 때 고른 어투 조각을 skill에 끼운다', () => {
  const target = scratch();
  install(target, ['--register', '해요체']);

  const skill = readFileSync(join(target, SKILL_REL), 'utf-8');
  const fragment = readFileSync(join(ROOT, 'skill', 'korean-style', 'register', 'hayo.md'), 'utf-8');
  assert.ok(skill.includes(fragment.trim()), '해요체 조각이 들어가지 않았습니다');
  assert.ok(!skill.includes('`~해 주시기 바랍니다`입니다.'), '다나까체 조각이 남아 있습니다');

  /* 공통 절은 그대로 있어야 합니다. */
  assert.match(skill, /check-korean\.mjs --stdin/);
  assert.match(skill, /^---$/m);
});

test('어투를 주지 않으면 기본 조각이 남는다', () => {
  const target = scratch();
  install(target);

  const skill = readFileSync(join(target, SKILL_REL), 'utf-8');
  const fragment = readFileSync(join(ROOT, 'skill', 'korean-style', 'register', 'danaka.md'), 'utf-8');
  assert.ok(skill.includes(fragment.trim()));
});

test('register 값이 설치된 검사기의 판정을 실제로 바꾼다', () => {
  /* 문서의 글자만 보면 부족합니다. */
  const target = scratch();
  install(target, ['--register', '해요체']);

  const r = runInstalled(target, ['--text', '이것은 확인한 결과입니다.']);
  assert.equal(r.status, 1, `해요체에서 다나까체 문장은 위반입니다. 나온 값은 ${r.status}입니다`);
  assert.match(r.stdout, /wrong-register/);
});

test('output-style 본문이 이 저장소의 규칙 검사를 통과한다', () => {
  /* output-style은 부족한 표현을 생성 전에 채우고 검사기는 금지 목록에 든 표현을 막습니다. */
  const rules = loadRules(rulesDocPath(ROOT));
  assert.notEqual(rules.source, null, '규칙 문서를 읽지 못했습니다');

  const body = readFileSync(join(ROOT, 'output-styles', 'korean-style.md'), 'utf-8');
  const violations = checkText(body, rules, 'doc');
  assert.equal(violations.length, 0, `output-style이 자기 규칙을 어겼습니다\n${JSON.stringify(violations, null, 2)}`);
});

test('설치할 때 고른 어투 조각을 output-style에도 끼운다', () => {
  /* skill과 같은 조각을 써야 합니다. */
  const target = scratch();
  const r = install(target, ['--register', '해요체']);
  assert.equal(r.status, 0, r.stderr);

  const body = readFileSync(join(target, STYLE_REL), 'utf-8');
  const fragment = readFileSync(join(ROOT, 'skill/korean-style/register/hayo.md'), 'utf8').trim();
  assert.ok(body.includes(fragment), '고른 어투가 들어가지 않았습니다');
  assert.ok(!body.includes('해요체를 섞지 않습니다'), '기본 어투가 남아 있습니다');
  assert.ok(body.includes('Preserve meaning before polishing'), '공통 지침이 사라졌습니다');
});

test('고른 output-style이 없으면 이 도구의 것을 켠다', () => {
  /* 파일을 두기만 하고 켜지 않으면 output-style이 세션에 없는 것과 같습니다. */
  const { settings, set } = mergeOutputStyle({});
  assert.equal(set, true);
  assert.equal(settings.outputStyle, 'korean-style');
});

test('대상이 이미 고른 output-style을 덮어쓰지 않는다', () => {
  /* 한 세션에 하나만 켜집니다. */
  const { settings, set, kept } = mergeOutputStyle({ outputStyle: 'explanatory' });
  assert.equal(set, false);
  assert.equal(kept, 'explanatory');
  assert.equal(settings.outputStyle, 'explanatory');
});

test('설치가 settings.json에 output-style을 적고 남의 키를 지우지 않는다', () => {
  const target = scratch();
  mkdirSync(join(target, '.claude'), { recursive: true });
  writeFileSync(join(target, '.claude', 'settings.json'), JSON.stringify({ env: { A: '1' } }), 'utf-8');

  install(target);

  const settings = JSON.parse(readFileSync(join(target, '.claude', 'settings.json'), 'utf-8'));
  assert.equal(settings.outputStyle, 'korean-style');
  assert.deepEqual(settings.env, { A: '1' }, '남의 키가 사라졌습니다');
});

test('설치한 프로젝트에서 doctor가 모든 점검 항목을 통과로 보고한다', () => {
  /* 이 도구에서 가장 경계할 상태는 구성 요소가 아무 알림 없이 꺼진 상태입니다. */
  const target = scratch();
  install(target);

  const r = spawnSync('bash', [join(target, INSTALLED_DIR, 'scripts', 'doctor.sh')], { encoding: 'utf-8' });
  assert.equal(r.status, 0, `점검이 실패로 끝났습니다\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /설치된 프로젝트/, '설치된 쪽으로 알아보지 못했습니다');
  assert.match(r.stdout, /실패 0개/, `실패가 남아 있습니다\n${r.stdout}`);
  for (const line of ['규칙 문서가 있고', '자체 검사를 통과', 'pretooluse', 'stop', 'Task', 'output-style 파일이 있습니다']) {
    assert.ok(r.stdout.includes(line), `점검이 ${line} 를 말하지 않습니다\n${r.stdout}`);
  }
});

test('규칙 문서가 없으면 점검이 실패로 끝난다', () => {
  /* 통과하는 경우만 확인하면 아무것도 검사하지 않는 스크립트도 이 테스트를 통과합니다. */
  const target = scratch();
  install(target);
  rmSync(join(target, INSTALLED_DIR, 'rules.md'));

  const r = spawnSync('bash', [join(target, INSTALLED_DIR, 'scripts', 'doctor.sh')], { encoding: 'utf-8' });
  assert.equal(r.status, 1, `규칙 문서를 지웠는데 통과했습니다\n${r.stdout}`);
  assert.match(r.stdout, /규칙 문서가 없습니다/);
});

test('git이 output-style을 빼고 규칙 문서는 남긴다', () => {
  const target = gitScratch();
  install(target);

  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: target }).status === 0;
  assert.ok(ignored(STYLE_REL), 'output-style이 커밋 대상입니다');
  assert.ok(!ignored(join(INSTALLED_DIR, 'rules.md')), '규칙 문서가 빠졌습니다');
});

test('dry-run은 아무것도 쓰지 않는다', () => {
  const target = scratch();
  const r = install(target, ['--dry-run']);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(target, INSTALLED_DIR)));
  assert.ok(!existsSync(join(target, '.claude')));
});

test('이 도구의 저장소에는 설치하지 않는다', () => {
  /* 설치하면 규칙의 기준이 둘로 갈립니다. */
  const r = install(ROOT);

  assert.equal(r.status, 2);
  assert.ok(!existsSync(join(ROOT, INSTALLED_DIR)));
});

test('없는 대상 경로에는 설치하지 않는다', () => {
  const r = install(join(scratch(), '없는-자리'));

  assert.equal(r.status, 2);
});

test('settings.json이 가리키는 hook 파일이 실제로 있다', () => {
  /* 설정의 hook 경로와 실제 파일 위치가 어긋나면 harness가 없는 파일을 실행하려 합니다. */
  const target = scratch();
  install(target);

  const settings = JSON.parse(readFileSync(join(target, '.claude', 'settings.json'), 'utf-8'));
  const commands = Object.values(settings.hooks).flatMap((list) =>
    list.flatMap((entry) => entry.hooks.map((h) => h.command)),
  );
  assert.equal(commands.length, 2);

  for (const command of commands) {
    const quoted = command.match(/"([^"]+)"/);
    assert.ok(quoted !== null, `명령에서 경로를 찾지 못했습니다: ${command}`);
    const path = quoted[1].replace('$CLAUDE_PROJECT_DIR', target);
    assert.ok(existsSync(path), `hook 설정은 있는데 파일이 없습니다: ${path}`);
  }
});

test('두 번 설치해도 settings.json의 hook 항목이 하나다', () => {
  const target = scratch();
  install(target);
  install(target);

  const settings = JSON.parse(readFileSync(join(target, '.claude', 'settings.json'), 'utf-8'));
  assert.equal(settings.hooks.PreToolUse.length, 1);
  assert.equal(settings.hooks.Stop.length, 1);
});

test('대상의 기존 설정을 지우지 않는다', () => {
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

test('git이 실제로 산출물을 빼고 규칙 문서와 hook 설정은 남긴다', () => {
  /* 줄이 있는지만 보면 부족합니다. */
  const target = gitScratch();
  install(target);

  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: target }).status === 0;

  assert.ok(ignored(join(INSTALLED_DIR, 'scripts', 'check-korean.mjs')), '검사 엔진이 커밋 대상입니다');
  assert.ok(ignored(join(INSTALLED_DIR, 'docs', 'limits.md')), '제약 문서가 커밋 대상입니다');
  assert.ok(ignored(SKILL_REL), 'skill이 커밋 대상입니다');

  /* 이 둘은 대상 프로젝트가 커밋할 파일입니다. */
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

test('대상의 기존 gitignore를 지우지 않는다', () => {
  const target = gitScratch();
  writeFileSync(join(target, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8');

  install(target);

  const ignore = readFileSync(join(target, '.gitignore'), 'utf-8');
  assert.ok(ignore.startsWith('node_modules/\ndist/\n'), '남의 줄이 사라졌습니다');
  assert.ok(ignore.includes(`${INSTALLED_DIR}/*`));
});

test('대상 gitignore에 이 도구 항목이 이미 있으면 손대지 않는다', () => {
  /* 그 프로젝트가 정한 것입니다. */
  const target = gitScratch();
  const mine = `# 우리가 정했습니다\n${INSTALLED_DIR}/\n`;
  writeFileSync(join(target, '.gitignore'), mine, 'utf-8');

  install(target);

  assert.equal(readFileSync(join(target, '.gitignore'), 'utf-8'), mine);
});

test('git 저장소가 아니면 gitignore를 만들지 않는다', () => {
  /* 아무것도 막지 못하는 파일을 남기면 이 도구가 무언가를 보장하는 것처럼 오해하게 됩니다. */
  const target = scratch();
  const r = install(target);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(target, '.gitignore')));
  assert.match(r.stdout, /\.git이 없어서/);
});

test('dry-run은 gitignore도 만들지 않는다', () => {
  const target = gitScratch();
  const r = install(target, ['--dry-run']);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(target, '.gitignore')));
});

test('설치된 검사기가 자체 검사를 통과한다', () => {
  const target = scratch();
  install(target);

  const r = runInstalled(target, ['--self-check']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /자체 검사 통과/);
});

test('회귀: 어느 어투로 설치해도 자체 검사가 통과한다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  for (const register of ['다나까체', '해요체', '혼용']) {
    const target = scratch();
    install(target, ['--register', register]);

    const r = runInstalled(target, ['--self-check']);
    assert.equal(r.status, 0, `${register}로 설치했을 때 실패했습니다\n${r.stdout}`);
  }
});

test('설치된 검사기가 대상의 위반을 잡는다', () => {
  const target = scratch();
  mkdirSync(join(target, 'docs'), { recursive: true });
  writeFileSync(join(target, 'docs', 'bad.md'), '# 안내\n\n결과가 보여집니다.\n', 'utf-8');
  writeFileSync(join(target, 'docs', 'good.md'), '# 안내\n\n결과가 보입니다.\n', 'utf-8');
  install(target);

  const r = runInstalled(target, ['--all']);
  assert.equal(r.status, 1, `심어 둔 위반을 잡아야 합니다. 나온 값은 ${r.status}입니다`);
  assert.match(r.stdout, /double-passive/);
  assert.match(r.stdout, /bad\.md/);

  /* 도구가 복사해 온 파일은 세지 않습니다. */
  assert.match(r.stdout, /파일 2개/);
});

test('설치된 hook이 규칙을 어긴 쓰기를 거부한다', () => {
  const target = scratch();
  install(target);

  const out = runInstalledHook(target, {
    tool_name: 'Write',
    tool_input: { file_path: join(target, 'docs', 'bad.md'), content: '# 제목\n\n결과가 보여집니다.\n' },
    cwd: target,
  });

  assert.notEqual(out, null, 'hook이 아무것도 내지 않았습니다');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /double-passive/);
});

test('설치된 hook이 규칙을 지킨 쓰기는 통과시킨다', () => {
  /* 잡는 쪽보다 이쪽이 중요합니다. */
  const target = scratch();
  install(target);

  const out = runInstalledHook(target, {
    tool_name: 'Write',
    tool_input: { file_path: join(target, 'docs', 'good.md'), content: '# 제목\n\n결과가 보입니다.\n' },
    cwd: target,
  });

  assert.equal(out, null);
});

test('설치된 hook이 새로 쓴 번역투 후보를 막지 않고 Claude에게 알린다', () => {
  /* 설치된 규칙 문서에 review-rules가 들어가지 않으면 이 알림은 조용히 꺼집니다. */
  const target = scratch();
  install(target);

  const out = runInstalledHook(target, {
    tool_name: 'Write',
    tool_input: { file_path: join(target, 'docs', 'note.md'), content: '# 제목\n\n로그를 통해 원인을 찾았습니다.\n' },
    cwd: target,
  });

  assert.notEqual(out, null, 'hook이 아무것도 내지 않았습니다');
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  assert.match(out.hookSpecificOutput.additionalContext, /\[translationese\] 3줄/);
});

const jsonAt = path => JSON.parse(readFileSync(path, 'utf8'));
const saveJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value)); };
const doctor = target => spawnSync('node', [join(target, INSTALLED_DIR, 'scripts/doctor.mjs')], { encoding: 'utf8', env: envFor(ROOT) });
const git = (target, args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
  { cwd: target, encoding: 'utf8', env: envFor(ROOT) });

test('Claude 세션 안에서 현재 프로젝트에 설치하고 원본 저장소를 가리키는 symlink에는 설치하지 않는다', () => {
  const target = scratch();
  const r = spawnSync('node', [join(ROOT, 'scripts/install.mjs'), '--target', target], { encoding: 'utf8', env: envFor(target) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(doctor(target).status, 0);
  const alias = join(scratch(), 'source');
  symlinkSync(ROOT, alias);
  assert.equal(install(alias).status, 2);
});

test('잘못된 옵션과 형식이 틀린 hook 설정을 파일을 바꾸기 전에 거부한다', () => {
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

test('이름이 같은 기존 output-style과 외부를 가리키는 symlink를 덮어쓰지 않는다', () => {
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

test('이전 기본 규칙만 자동 갱신하고 어투와 사용자 규칙은 보존한다', () => {
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

test('activate는 프로젝트 스타일만 선택하고 기존 파일과 로컬 설정은 유지한다', () => {
  const target = scratch();
  const path = join(target, '.claude/settings.json');
  const local = join(target, '.claude/settings.local.json');
  saveJson(path, { outputStyle: 'custom', env: { KEEP: '1' } });
  saveJson(local, { outputStyle: 'local-custom', disableAllHooks: true });
  assert.equal(install(target, ['--activate']).status, 0);
  assert.equal(jsonAt(path).outputStyle, 'korean-style');
  assert.deepEqual(jsonAt(path).env, { KEEP: '1' });
  assert.equal(jsonAt(local).outputStyle, 'local-custom');
  const r = doctor(target);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /disableAllHooks/);
  assert.match(r.stdout, /local-custom/);
  rmSync(local);
  assert.equal(doctor(target).status, 0);
});

test('재설치가 기존 hook의 matcher를 넓히지 않고 자기 항목만 복구한다', () => {
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

test('core.hooksPath를 따로 지정해도 실제 git commit을 검사하고 외부 hook은 덮어쓰지 않는다', () => {
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

test('worktree끼리 공유하는 hook은 커밋하는 checkout의 규칙을 따른다', () => {
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

test('이 도구가 건 hook의 끊어진 symlink는 복구하고 외부 symlink는 보존한다', () => {
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

test('나중에 git init한 뒤 재설치해도 동작하고 clone한 프로젝트에서 다시 설치할 수 있다', () => {
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

test('README 자동 설치 명령을 새 프로젝트와 기존 프로젝트에서 그대로 실행한다', () => {
  const source = gitScratch();
  for (const path of ['scripts', 'docs', 'skill', 'output-styles', 'LICENSE', 'package.json']) {
    cpSync(join(ROOT, path), join(source, path), { recursive: true });
  }
  assert.equal(git(source, ['add', '.']).status, 0);
  assert.equal(git(source, ['commit', '-qm', 'fixture']).status, 0);
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8').match(/```sh\n([\s\S]*?)\n```/)[1];
  /* GitHub 대신 이 checkout을 npx로 받습니다. 받은 패키지는 package.json의 files만 담습니다. */
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
      assert.deepEqual(jsonAt(join(target, '.claude/settings.json')).env, { KEEP: '1' });
    }
  }
});

test('사용자 규칙을 바꿔도 엔진 자체 검사는 통과하고 실제 검사는 사용자 규칙을 따른다', () => {
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

test('doctor는 review-rules가 빠진 규칙이면 주의로 알리고 기본 규칙이면 알리지 않는다', () => {
  /* 직접 고친 규칙은 재설치해도 새 키가 들어가지 않으므로 검토 후보 알림이 꺼진 채 남습니다. */
  const target = scratch();
  install(target);
  assert.doesNotMatch(doctor(target).stdout, /review-rules/);
  const path = join(target, INSTALLED_DIR, 'rules.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^review-rules:.*\n/m, ''));
  const r = doctor(target);
  assert.equal(r.status, 0, '알림이 꺼진 것은 설치 실패가 아닙니다');
  assert.match(r.stdout, /주의 {2}review-rules가 없거나 비어 있어/);
  writeFileSync(path, `${readFileSync(path, 'utf8').replace('```korean-style-rules\n', '```korean-style-rules\nreview-rules: translationese, translationeze\n')}`);
  assert.match(doctor(target).stdout, /review-rules의 다음 이름은 advisory-rules에 없어 알림에 쓰이지 않습니다: translationeze$/m);
});

test('doctor는 해석하지 못하는 어투와 문자 정책을 성공으로 보고하지 않는다', () => {
  const target = scratch();
  install(target);
  const path = join(target, INSTALLED_DIR, 'rules.md');
  const body = readFileSync(path, 'utf8');
  for (const changed of [body.replace('register: 다나까체', 'register: unknown'), body.replace('banned-char: middot,', 'banned-char: unknown,')]) {
    writeFileSync(path, changed);
    const r = doctor(target);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /알 수 없는/);
  }
});
