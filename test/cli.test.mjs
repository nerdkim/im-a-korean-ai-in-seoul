/* 명령줄 진입점 테스트입니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts', 'check-korean.mjs');

/* 검사기를 자식 프로세스로 띄웁니다. */
function run(args, { stdin, rules } = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
  if (rules === undefined) delete env.KOREAN_STYLE_RULES;
  else env.KOREAN_STYLE_RULES = rules;
  return spawnSync('node', [CLI, ...args], {
    input: stdin ?? '',
    encoding: 'utf-8',
    cwd: ROOT,
    env,
  });
}

/* 존재하지 않는 규칙 문서의 경로를 만듭니다. */
function missingRulesPath() {
  return join(mkdtempSync(join(tmpdir(), 'korean-style-cli-')), 'none.md');
}

/* 합니다체를 어긴 문장입니다. */
const REGISTER_VIOLATION = '확인했어요. 곧 알려 드릴게요.';

/* 아무 규칙에도 걸리지 않는 문장입니다. */
const CLEAN = '작업을 마쳤습니다. 결과를 정리해 드리겠습니다.';

test('경고만 있으면 보고만 하고, --strict를 주었을 때만 실패한다', () => {
  const normal = run(['--text', 'API를 통해 확인합니다.']);
  assert.equal(normal.status, 0);
  assert.match(normal.stdout, /경고 1건/);
  assert.equal(run(['--text', 'API를 통해 확인합니다.', '--strict']).status, 1);
});

test('회귀: --text 다음에 문장이 없으면 통과라고 보고하지 않는다', () => {
  const r = run(['--text']);
  assert.equal(r.status, 2, '사용법 오류이므로 종료 코드가 2여야 합니다');
  assert.match(r.stderr, /문장이 필요합니다/);
  assert.doesNotMatch(r.stdout, /통과/, '빈 문장을 검사해 통과라고 말하면 안 됩니다');
});

test('--file 다음에 경로가 없으면 사용법 오류다', () => {
  const r = run(['--file']);
  assert.equal(r.status, 2);
});

test('--explain 다음에 규칙 이름이 없으면 사용법 오류다', () => {
  const r = run(['--explain']);
  assert.equal(r.status, 2);
});

test('아무 인자도 없으면 사용법 오류다', () => {
  const r = run([]);
  assert.equal(r.status, 2);
});

test('--stdin을 주면 표준 입력으로 받은 글에서 위반을 잡는다', () => {
  const r = run(['--stdin', '--target', 'chat'], { stdin: REGISTER_VIOLATION });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /wrong-register/);
});

test('--stdin으로 받은 글에 위반이 없으면 통과시킨다', () => {
  const r = run(['--stdin', '--target', 'chat'], { stdin: CLEAN });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /통과/);
});

test('--stdin은 shell 특수 문자도 그대로 받는다', () => {
  /* 입력에 `$`, 따옴표, 백슬래시를 넣습니다. */
  const r = run(['--stdin', '--target', 'doc'], { stdin: '값은 $1 이고 경로는 "a\\b" 입니다.' });
  assert.equal(r.status, 0, `통과해야 합니다. 출력: ${r.stdout}${r.stderr}`);
});

test('--stdin으로 여러 줄을 받으면 둘째 줄의 위반도 잡는다', () => {
  const r = run(['--stdin', '--target', 'chat'], { stdin: `${CLEAN}\n${REGISTER_VIOLATION}\n` });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /2줄/, '둘째 줄에서 걸려야 합니다');
});

/* 규칙 문서를 못 읽으면 --text, --file, --stdin, --all, --self-check 가운데 어느 것도 통과로 끝나면 안 됩니다. */

test('회귀: 규칙 문서를 못 읽으면 --text가 통과로 끝나지 않는다', () => {
  const r = run(['--text', REGISTER_VIOLATION], { rules: missingRulesPath() });
  assert.notEqual(r.status, 0, '일부 규칙으로만 검사하고 통과라고 보고하면 거짓입니다');
  assert.match(r.stdout, /통과로 보지 않습니다/);
});

test('회귀: 규칙 문서를 못 읽으면 --file이 통과로 끝나지 않는다', () => {
  const r = run(['--file', 'README.md'], { rules: missingRulesPath() });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /통과로 보지 않습니다/);
});

test('회귀: 규칙 문서를 못 읽으면 --stdin이 통과로 끝나지 않는다', () => {
  const r = run(['--stdin'], { stdin: CLEAN, rules: missingRulesPath() });
  assert.notEqual(r.status, 0);
});

test('규칙 문서를 못 읽으면 --all이 통과로 끝나지 않는다', () => {
  const r = run(['--all'], { rules: missingRulesPath() });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /통과로 보지 않습니다/);
});

test('규칙 문서를 못 읽으면 --self-check가 통과로 끝나지 않는다', () => {
  const r = run(['--self-check'], { rules: missingRulesPath() });
  assert.notEqual(r.status, 0);
});

test('회귀: 규칙 문서를 못 읽으면 위반이 없어도 출력에 통과라고 쓰지 않는다', () => {
  /* 실제로 있었던 결함을 재현합니다. 종료 코드는 1이었는데 출력에는 통과라고 나왔습니다. */
  const text = run(['--text', CLEAN], { rules: missingRulesPath() });
  assert.match(text.stdout, /^위반 없음 \(chat\)$/m);
  assert.doesNotMatch(text.stdout, /^통과/m);
  const self = run(['--self-check'], { rules: missingRulesPath() });
  assert.match(self.stdout, /자체 검사 실패: 규칙 문서를 읽지 못했습니다/);
  assert.doesNotMatch(self.stdout, /자체 검사 통과/);
});

test('회귀: 프로젝트 밖에 있는 규칙 문서를 읽으면 그 경로를 그대로 보여 준다', () => {
  /* 실제로 있었던 결함을 재현합니다. 경로 대신 null을 출력했습니다. */
  const path = join(mkdtempSync(join(tmpdir(), 'korean-style-cli-')), 'rules.md');
  writeFileSync(path, readFileSync(join(ROOT, 'docs', 'rules.md'), 'utf-8'));
  const r = run(['--self-check'], { rules: path });
  assert.equal(r.status, 0, r.stdout);
  assert.ok(r.stdout.includes(`프로젝트 규칙 문서: ${path}`), r.stdout);
});

test('프로젝트 규칙 문서에 없는 규칙의 설명은 도구와 함께 배포한 기본 규칙 문서에서 찾는다', () => {
  /* 직접 고친 예전 규칙 문서에는 새로 생긴 규칙의 설명이 없지만, Stop hook은 그 규칙으로 답변을 막고 `--explain` 명령을 안내합니다. */
  const path = join(mkdtempSync(join(tmpdir(), 'korean-style-cli-')), 'rules.md');
  writeFileSync(path, '```korean-style-rules\nregister: 다나까체\n```\n', 'utf-8');
  const r = run(['--explain', 'ai-attribution'], { rules: path });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /생성 표시/);
});

test('규칙 문서를 읽었으면 "통과로 보지 않습니다" 경고를 붙이지 않는다', () => {
  const r = run(['--text', CLEAN]);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /통과로 보지 않습니다/, '정상일 때 경고가 붙으면 사람이 경고를 무시하게 됩니다');
});

test('규칙 블록이 없는 문서를 읽으면 통과로 끝나지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'korean-style-cli-'));
  const path = join(dir, 'rules.md');
  writeFileSync(path, '# 규칙\n\n블록이 없습니다.\n', 'utf-8');
  const r = run(['--text', REGISTER_VIOLATION], { rules: path });
  assert.notEqual(r.status, 0, '블록을 못 읽은 것은 문서를 못 읽은 것과 같습니다');
});

test('알 수 없는 --target 값은 사용법 오류다', () => {
  const r = run(['--text', CLEAN, '--target', 'nowhere']);
  assert.equal(r.status, 2);
});

test('--target을 주지 않으면 chat으로 본다', () => {
  const r = run(['--text', CLEAN]);
  assert.match(r.stdout, /\(chat\)/);
});
