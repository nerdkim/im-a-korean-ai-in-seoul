/* hook 테스트입니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { commitMessagesIn, formatReviewNotes, resultOfEdit, reviewNotes } from '../scripts/hooks/pretooluse.mjs';
import { lastAssistantText } from '../scripts/hooks/stop.mjs';
import { messageBody } from '../scripts/hooks/commit-msg.mjs';
import { mergeHookSettings } from '../scripts/install.mjs';
import { loadRules } from '../scripts/lib/rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = loadRules(join(ROOT, 'docs', 'rules.md'));
const scratch = () => mkdtempSync(join(tmpdir(), 'korean-style-hook-'));

/* hook을 실제로 띄우고 stdout을 JSON으로 읽습니다. */
function runHook(script, input) {
  const r = spawnSync('node', [join(ROOT, 'scripts', 'hooks', script)], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    cwd: ROOT,
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  assert.equal(r.status, 0, `hook은 언제나 종료 코드 0으로 끝나야 합니다. 나온 값은 ${r.status}입니다`);
  const out = (r.stdout ?? '').trim();
  if (out.length === 0) return null;
  return JSON.parse(out);
}

test('회귀: symlink로 건 commit-msg hook이 실제로 막는다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const dir = scratch();
  const link = join(dir, 'commit-msg');
  symlinkSync(join(ROOT, 'scripts', 'hooks', 'commit-msg.mjs'), link);
  const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };

  const bad = join(dir, 'bad.txt');
  writeFileSync(bad, 'fix: 결과가 보여집니다\n', 'utf-8');
  const denied = spawnSync('node', [link, bad], { encoding: 'utf-8', cwd: ROOT, env });
  assert.equal(denied.status, 1, `symlink로 불러도 막아야 합니다\n${denied.stdout}${denied.stderr}`);
  assert.match(`${denied.stdout}${denied.stderr}`, /double-passive/);

  const good = join(dir, 'good.txt');
  writeFileSync(good, 'fix: 결과가 보입니다\n', 'utf-8');
  const allowed = spawnSync('node', [link, good], { encoding: 'utf-8', cwd: ROOT, env });
  assert.equal(allowed.status, 0, allowed.stdout);
});

test('회귀: import만으로는 hook이 실행되지 않는다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  assert.equal(typeof resultOfEdit, 'function');
  assert.equal(typeof commitMessagesIn, 'function');
  assert.equal(typeof lastAssistantText, 'function');
  assert.equal(typeof messageBody, 'function');
  assert.equal(typeof mergeHookSettings, 'function');
});

test('회귀: new_string의 달러 기호를 치환 패턴으로 읽지 않는다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const path = join(scratch(), 'a.md');
  writeFileSync(path, '앞\n바꿀곳\n뒤\n', 'utf-8');
  const got = resultOfEdit('Edit', { old_string: '바꿀곳', new_string: 'replace(/x/, "$&$1")' }, path);
  assert.ok(got.includes('$&$1'), `달러 기호가 그대로 남아야 하는데 ${JSON.stringify(got)}입니다`);
});

test('회귀: 이번 turn의 답변을 모두 모은다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const path = join(scratch(), 'transcript.jsonl');
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'text', text: '지난 turn입니다.' }] } },
    { type: 'user', message: { content: '고쳐 주십시오.' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '첫 답변입니다.' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '둘째 답변입니다.' }] } },
  ];
  writeFileSync(path, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf-8');
  const got = lastAssistantText(path);
  assert.ok(got.includes('첫 답변입니다'), '같은 turn의 앞선 답변도 모아야 합니다');
  assert.ok(got.includes('둘째 답변입니다'));
  assert.ok(!got.includes('지난 turn'), '사용자 메시지를 넘어가지 않아야 합니다');
  assert.ok(got.indexOf('첫 답변') < got.indexOf('둘째 답변'), '순서가 유지되어야 합니다');
});

test('깨진 줄 하나 때문에 기록 전체를 버리지 않는다', () => {
  const path = join(scratch(), 'transcript.jsonl');
  const good = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '확인했습니다.' }] } });
  writeFileSync(path, `{깨진 줄\n${good}\n`, 'utf-8');
  assert.equal(lastAssistantText(path), '확인했습니다.');
});

test('기록 파일이 없으면 null을 돌려준다', () => {
  assert.equal(lastAssistantText(join(scratch(), '없음.jsonl')), null);
});

test('규칙을 어긴 문서 쓰기를 거부한다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Write',
    tool_input: { file_path: join(ROOT, 'docs', '시험.md'), content: '워크플로우를 확인했어요.' },
  });
  assert.ok(out !== null, '거부해야 합니다');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('워크플로'), '무엇으로 고칠지 말해야 합니다');
});

test('규칙을 지킨 문서 쓰기는 통과시킨다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Write',
    tool_input: { file_path: join(ROOT, 'docs', '시험.md'), content: '워크플로를 확인했습니다.' },
  });
  assert.equal(out, null, '통과는 아무것도 내지 않습니다');
});

/* 오류가 없는 파일 쓰기는 막지 않고, 새로 쓴 부분의 경고는 Claude에게만 알립니다. */

test('새로 쓴 문서의 번역투 후보는 쓰기를 막지 않고 Claude에게 알린다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Write',
    tool_input: { file_path: join(ROOT, 'docs', '시험.md'), content: '로그를 통해 원인을 찾았습니다.' },
  });
  assert.ok(out !== null, '검토 후보를 알려야 합니다');
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined, '`allow`를 돌려주면 사용자 승인 절차를 건너뜁니다');
  assert.match(out.hookSpecificOutput.additionalContext, /\[translationese\] 1줄: .*를 통해/);
});

test('바뀌기 전 파일에 있던 경고는 Edit로 그 줄을 고쳐도 다시 알리지 않는다', () => {
  /* 실제 파일이 있어야 바뀌기 전 내용과 비교할 수 있으므로 임시 프로젝트에서 hook을 띄웁니다. */
  const project = scratch();
  const file = join(project, 'a.md');
  writeFileSync(file, '# 제목\n\n로그를 통해 원인을 찾았습니다.\n', 'utf-8');
  const r = spawnSync('node', [join(ROOT, 'scripts', 'hooks', 'pretooluse.mjs')], {
    input: JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: file, old_string: '원인을 찾았습니다.', new_string: '원인을 다시 찾았습니다.' },
    }),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, KOREAN_STYLE_RULES: join(ROOT, 'docs', 'rules.md') },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '', '이번 편집이 만든 표현이 아닙니다');
});

test('review-rules에 없는 경고는 알리지 않는다', () => {
  /* 쉼표 수 규칙은 경고 규칙이지만 검토 후보로는 알리지 않습니다. */
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Write',
    tool_input: {
      file_path: join(ROOT, 'docs', '시험.md'),
      content: '오늘 배포를 마쳤고, 남은 것은 보고 하나이며, 확인이 필요하고, 일정은 내일입니다.',
    },
  });
  assert.equal(out, null);
});

test('오류가 있으면 검토 후보를 알리지 않고 쓰기를 거부한다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Write',
    tool_input: { file_path: join(ROOT, 'docs', '시험.md'), content: '로그를 통해 원인을 찾았어요.' },
  });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(out.hookSpecificOutput.additionalContext, undefined);
});

test('커밋 메시지와 질문의 경고는 검토 후보로 알리지 않는다', () => {
  /* 알림은 도구가 실행된 뒤에 도착하므로 이미 끝난 커밋이나 보낸 질문은 고칠 수 없습니다. */
  assert.equal(runHook('pretooluse.mjs', { tool_name: 'Bash', tool_input: { command: 'git commit -m "로그를 통해 원인을 찾았습니다"' } }), null);
  assert.equal(runHook('pretooluse.mjs', {
    tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question: '로그를 통해 확인할까요?', header: '확인' }] },
  }), null);
});

/* 편집 전 파일을 만들고 편집을 적용해 전후 내용을 돌려줍니다. */
function edited(name, before, toolName, toolInput) {
  const path = join(scratch(), name);
  writeFileSync(path, before, 'utf-8');
  return { before, after: resultOfEdit(toolName, toolInput, path) };
}

const rulesOf = (before, after, target = 'doc', path = 'docs/a.md') =>
  reviewNotes(before, after, RULES, target, path).map(v => v.rule);

test('MultiEdit로 문단을 옮겨도 원래 있던 후보는 다시 알리지 않는다', () => {
  const moved = edited('a.md', '로그를 통해 봤습니다.\n\n둘째 문단입니다.\n', 'MultiEdit', { edits: [
    { old_string: '로그를 통해 봤습니다.\n\n', new_string: '' },
    { old_string: '둘째 문단입니다.\n', new_string: '둘째 문단입니다.\n\n로그를 통해 봤습니다.\n' },
  ] });
  assert.deepEqual(rulesOf(moved.before, moved.after), []);
  const added = edited('a.md', '로그를 통해 봤습니다.\n', 'MultiEdit', { edits: [
    { old_string: '로그를 통해 봤습니다.\n', new_string: '로그를 통해 봤습니다.\n\n여러 파일들을 확인했습니다.\n' },
  ] });
  assert.deepEqual(rulesOf(added.before, added.after), ['redundant-plural']);
});

test('Write로 기존 파일을 덮어쓰면 원래 있던 경고는 다시 알리지 않는다', () => {
  const before = '로그를 통해 원인을 찾았습니다.\n';
  const notes = reviewNotes(before, `${before}\n여러 파일들을 봤습니다.\n`, RULES, 'doc', 'a.md');
  assert.deepEqual(notes.map(v => [v.rule, v.line]), [['redundant-plural', 3]], '줄 번호는 파일 기준입니다');
});

test('같은 문단에서 바꾸지 않은 줄의 후보는 다시 알리지 않는다', () => {
  assert.deepEqual(rulesOf('로그를 통해 원인을 찾았습니다.\n결과를 적었습니다.\n', '로그를 통해 원인을 찾았습니다.\n결과를 다시 적었습니다.\n'), []);
});

test('편집 조각에 주석 표시가 없어도 주석 안의 후보를 알린다', () => {
  /* Edit는 바꿀 부분만 담는 경우가 많아 조각에 `//`가 없습니다. */
  const { before, after } = edited('a.js', '// 사용자를 조회합니다.\nconst a = 1;\n', 'Edit', {
    old_string: '사용자를 조회합니다.', new_string: '로그를 통해 사용자를 조회합니다.',
  });
  assert.deepEqual(rulesOf(before, after, 'comment', 'src/a.js'), ['translationese']);
});

test('문자열 리터럴만 바꾼 소스 편집은 검토 후보를 알리지 않는다', () => {
  assert.deepEqual(rulesOf("// 주석입니다.\nconst a = '확인';\n", "// 주석입니다.\nconst a = '로그를 통해 확인';\n", 'comment', 'src/a.js'), []);
});

test('기존 code block 안에 쓴 글은 검토 후보로 알리지 않는다', () => {
  const { before, after } = edited('a.md', '# 제목\n\n```\n예시입니다.\n```\n', 'Edit', {
    old_string: '예시입니다.', new_string: '로그를 통해 예시입니다.',
  });
  assert.deepEqual(rulesOf(before, after), []);
});

test('규칙 설정 블록에 치환 후보를 더해도 검토 후보로 알리지 않는다', () => {
  /* 규칙 문서를 고치는 것은 설치한 프로젝트가 규칙을 바꾸는 정상 절차입니다. */
  const before = '# 규칙\n\n```korean-style-rules\ntranslationese-patterns: 를 통해=~해\n```\n';
  assert.deepEqual(rulesOf(before, before.replace('=~해', '=~해, 문서를 통하여서=로'), 'doc', '.korean-style/rules.md'), []);
});

test('review-rules가 비어 있으면 검토 후보를 알리지 않는다', () => {
  /* 이 키가 없는 구버전 규칙으로 설치한 프로젝트입니다. */
  assert.deepEqual(reviewNotes('', '로그를 통해 원인을 찾았습니다.', { ...RULES, reviewRules: [] }, 'doc', 'a.md'), []);
});

test('검토 후보가 많으면 앞의 다섯 건만 보여 주고 나머지 건수를 알린다', () => {
  const notes = Array.from({ length: 7 }, (_, i) => ({ rule: 'translationese', line: i + 1, detail: `후보 ${i + 1}` }));
  const text = formatReviewNotes(notes, 'a.md', '.korean-style/scripts/check-korean.mjs');
  assert.match(text, /검토 후보 7건/);
  assert.match(text, /후보 5$/m);
  assert.doesNotMatch(text, /후보 6/);
  assert.match(text, /나머지 2건은 `node \.korean-style\/scripts\/check-korean\.mjs --file a\.md` 명령으로/);
  assert.match(formatReviewNotes(notes, 'docs/my notes.md'), /--file 'docs\/my notes\.md'/, '공백이 든 경로는 따옴표로 감싸야 명령이 그대로 실행됩니다');
});

test('프로젝트 밖의 파일은 판정하지 않는다', () => {
  /* hook은 agent가 컴퓨터의 어느 경로에 쓰든 발동합니다. */
  const outside = join(scratch(), 'a.md');
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Write',
    tool_input: { file_path: outside, content: '워크플로우를 확인했어요.' },
  });
  assert.equal(out, null);
});

test('검사 대상이 아닌 확장자는 보지 않는다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Write',
    tool_input: { file_path: join(ROOT, 'a.png'), content: '워크플로우를 확인했어요.' },
  });
  assert.equal(out, null);
});

test('사람이 읽는 도구 입력이 규칙을 어기면 거부한다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question: '당신이 원하는 것은 무엇입니까?', header: '선택' }] },
  });
  assert.ok(out !== null, '거부해야 합니다');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('당신'));
});

test('subagent에게 주는 한국어 프롬프트가 규칙을 어기면 거부한다', () => {
  /* output-style은 subagent에 적용되지 않습니다. */
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Task',
    tool_input: { prompt: '결과가 보여집니다. 보고해 주십시오.', subagent_type: 'code-explorer' },
  });
  assert.ok(out !== null, '거부해야 합니다');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('double-passive'));
});

test('영어로 쓴 subagent 프롬프트는 거부하지 않는다', () => {
  /* 이 케이스가 더 중요합니다. */
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Task',
    tool_input: { prompt: 'Read scripts/lib/text.mjs and report the sentence splitting contract in detail.' },
  });
  assert.equal(out, null);
});

test('깨끗한 한국어 subagent 프롬프트는 통과시킨다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Task',
    tool_input: { prompt: '이 파일을 읽고 문장 분해 계약을 정확히 보고하십시오. 추측하지 마십시오.' },
  });
  assert.equal(out, null);
});

test('규칙을 어긴 커밋 메시지를 거부한다', () => {
  const out = runHook('pretooluse.mjs', {
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "워크플로우를 정리했습니다"' },
  });
  assert.ok(out !== null, '거부해야 합니다');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('워크플로'));
});

test('git commit이 아닌 Bash 명령은 보지 않는다', () => {
  const out = runHook('pretooluse.mjs', { tool_name: 'Bash', tool_input: { command: 'ls -la 워크플로우' } });
  assert.equal(out, null);
});

/* shell 명령으로 쓰는 파일입니다. 전에는 이 hook이 `Write`와 `Edit` 계열만 파일 쓰기로 봤습니다. */

/* Bash 명령 하나를 hook에 넣고 거부되었는지 돌려줍니다. */
function bashDenied(command) {
  const out = runHook('pretooluse.mjs', { tool_name: 'Bash', cwd: ROOT, tool_input: { command } });
  return out !== null && out.hookSpecificOutput?.permissionDecision === 'deny';
}

test('회귀: heredoc으로 검사 대상 문서를 쓰면 거부한다', () => {
  assert.ok(bashDenied('cat > notes/x.md <<EOF\n본문입니다\nEOF'));
});

test('회귀: >>로 검사 대상 문서에 덧붙이면 거부한다', () => {
  assert.ok(bashDenied('echo hi >> README.md'));
});

test('회귀: 제자리 편집으로 규칙 문서를 고치면 거부한다', () => {
  assert.ok(bashDenied("sed -i 's/a/b/' docs/rules.md"));
});

test('회귀: tee로 소스 파일을 쓰면 거부한다', () => {
  assert.ok(bashDenied('echo x | tee scripts/lib/new.mjs'));
});

test('검사 대상이 아닌 확장자의 파일로 내보내면 통과시킨다', () => {
  assert.ok(!bashDenied('node scripts/check-korean.mjs --all > out.log'));
});

test('프로젝트 밖의 파일로 내보내면 통과시킨다', () => {
  assert.ok(!bashDenied('npm run gate > /tmp/out.txt 2>&1'));
  assert.ok(!bashDenied('cat > /tmp/scratch.md <<EOF\n아무 내용\nEOF'));
});

test('/dev/null과 파일 서술자 재지정은 검사 대상 경로로 보지 않는다', () => {
  assert.ok(!bashDenied('git diff > /dev/null'));
  assert.ok(!bashDenied('node scripts/gate.mjs 2>&1 | tail -5'));
});

test('읽기만 하는 명령은 통과시킨다', () => {
  assert.ok(!bashDenied('cat docs/rules.md | head -20'));
  assert.ok(!bashDenied("sed -n '1,20p' docs/rules.md"));
  assert.ok(!bashDenied("grep -rn 'foo' docs/ | head"));
});

test('회귀: shell이 확장할 부분이 남은 경로는 판정하지 않는다', () => {
  /* 첫 측정에서 임시 디렉터리를 가리키는 변수가 프로젝트 안의 소스 파일로 읽혔습니다. */
  assert.ok(!bashDenied('cat > $SCRATCH/probe.mjs <<EOF\n내용\nEOF'));
  assert.ok(!bashDenied('echo x > ~/notes.md'));
});

test('heredoc 본문 안의 부등호를 방향 재지정으로 읽지 않는다', () => {
  /* 본문에 마크다운 인용문이 들어 있는 경우입니다. */
  assert.ok(!bashDenied('cat > /tmp/a.txt <<EOF\n> docs/rules.md 를 보십시오\nEOF'));
});

test('깨진 입력을 받아도 종료 코드 0으로 끝난다', () => {
  const r = spawnSync('node', [join(ROOT, 'scripts', 'hooks', 'pretooluse.mjs')], {
    input: '이것은 JSON이 아닙니다',
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  assert.equal(r.status, 0);
});

test('git commit 명령에서 메시지를 모두 뽑는다', () => {
  assert.deepEqual(commitMessagesIn('git commit -m "첫 문단" -m "둘째 문단"'), ['첫 문단', '둘째 문단']);
  assert.deepEqual(commitMessagesIn("git commit -m '작은따옴표'"), ['작은따옴표']);
  assert.deepEqual(commitMessagesIn('git commit --message="긴 형태"'), ['긴 형태']);
  assert.deepEqual(commitMessagesIn('git add . && git commit -m "이어 쓴 명령"'), ['이어 쓴 명령']);
});

test('commit이 아닌 명령에서는 아무것도 뽑지 않는다', () => {
  assert.deepEqual(commitMessagesIn('echo -m "확인"'), []);
  assert.deepEqual(commitMessagesIn(undefined), []);
});

test('메시지 파일에서 git 안내 주석을 지운다', () => {
  const raw = ['확인했습니다.', '# 이 줄은 git이 쓴 안내입니다.', '', '본문 #123 번은 남습니다.'].join('\n');
  const body = messageBody(raw);
  assert.ok(!body.includes('git이 쓴 안내'));
  assert.ok(body.includes('#123'), '줄 가운데의 우물 정은 메시지의 일부입니다');
});

function transcriptWith(text) {
  const path = join(scratch(), 'transcript.jsonl');
  writeFileSync(path, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })}\n`, 'utf-8');
  return path;
}

test('기록 파일이 없어도 최종 응답 필드의 오류를 검사한다', () => {
  const out = runHook('stop.mjs', { last_assistant_message: '작업이 완료됬습니다.', stop_hook_active: false });
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /known-typo/);
});

test('최신 최종 응답이 있으면 오래된 기록을 재검사하지 않는다', () => {
  assert.equal(runHook('stop.mjs', { transcript_path: transcriptWith('결과가 보여집니다.'),
    last_assistant_message: '결과가 보입니다.', stop_hook_active: false }), null);
});

test('경고만 있는 답변에는 재작성을 요구하지 않는다', () => {
  assert.equal(runHook('stop.mjs', { last_assistant_message: 'API를 통해 확인했습니다.' }), null);
});

test('최종 응답 필드를 사용해도 재작성은 한 번으로 제한한다', () => {
  assert.equal(runHook('stop.mjs', { last_assistant_message: '작업이 완료됬습니다.', stop_hook_active: true }), null);
});

test('도구 결과를 새 사용자 요청으로 오인하지 않는다', () => {
  const path = join(scratch(), 'tool-results.jsonl');
  const entries = [
    { type: 'user', message: { content: '확인해 주세요.' } },
    { type: 'assistant', message: { content: '먼저 살펴보겠습니다.' } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'assistant', message: { content: '확인했습니다.' } },
  ];
  writeFileSync(path, entries.map(e => JSON.stringify(e)).join('\n'));
  assert.equal(lastAssistantText(path), '먼저 살펴보겠습니다.\n\n확인했습니다.');
});

test('현재 Agent 도구에서도 오류를 검사한다', () => {
  const out = runHook('pretooluse.mjs', { tool_name: 'Agent', tool_input: { prompt: '결과가 보여집니다.' } });
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /double-passive/);
});

test('규칙을 어긴 답변이면 turn을 차단한다', () => {
  const path = transcriptWith('당신이 요청한 대로 워크플로우를 정리했어요.');
  const out = runHook('stop.mjs', { transcript_path: path, stop_hook_active: false });
  assert.ok(out !== null, '차단해야 합니다');
  assert.equal(out.decision, 'block');
  assert.ok(out.reason.includes('당신'));
  assert.ok(out.reason.includes('--explain'), '어디서 규칙을 볼지 알려 주어야 합니다');
});

test('깨끗한 답변은 차단하지 않는다', () => {
  const path = transcriptWith('요청한 대로 워크플로를 정리했습니다.');
  assert.equal(runHook('stop.mjs', { transcript_path: path, stop_hook_active: false }), null);
});

test('이미 이어진 turn은 다시 차단하지 않는다', () => {
  /* 이 검사가 없으면 만족할 수 없는 규칙 하나 때문에 차단과 재작성이 끝없이 되풀이됩니다. */
  const path = transcriptWith('당신이 요청한 것입니다.');
  assert.equal(runHook('stop.mjs', { transcript_path: path, stop_hook_active: true }), null);
});

test('기록 경로가 없으면 아무 일도 하지 않는다', () => {
  assert.equal(runHook('stop.mjs', { stop_hook_active: false }), null);
});

/* ---------------------------------------------------------------------------  git commit-msg hook  --------------------------------------------------------------------------- */

function runCommitMsg(body) {
  const path = join(scratch(), 'COMMIT_EDITMSG');
  writeFileSync(path, body, 'utf-8');
  return spawnSync('node', [join(ROOT, 'scripts', 'hooks', 'commit-msg.mjs'), path], {
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
}

test('commit-msg hook은 규칙을 어긴 메시지면 커밋을 멈춘다', () => {
  const r = runCommitMsg('fix: 워크플로우를 정리했어요\n\n# 안내\n');
  assert.equal(r.status, 1, '커밋을 멈춰야 합니다');
  assert.ok(r.stderr.includes('워크플로'), '무엇으로 고칠지 말해야 합니다');
});

test('commit-msg hook은 깨끗한 메시지를 통과시킨다', () => {
  assert.equal(runCommitMsg('fix: 워크플로를 정리했습니다\n').status, 0);
});

test('메시지 파일 없이 호출되면 통과시킨다', () => {
  const r = spawnSync('node', [join(ROOT, 'scripts', 'hooks', 'commit-msg.mjs')], { encoding: 'utf-8' });
  assert.equal(r.status, 0);
});

test('설치는 대상 프로젝트의 기존 hook을 지우지 않는다', () => {
  const mine = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo 남의 hook' }] }] }, env: { FOO: 'bar' } };
  const { settings, added } = mergeHookSettings(mine);
  assert.equal(added.length, 2);
  assert.equal(settings.hooks.Stop.length, 2);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'echo 남의 hook');
  assert.equal(settings.env.FOO, 'bar');
});

test('설치를 두 번 해도 hook 항목이 하나다', () => {
  const once = mergeHookSettings({}).settings;
  const twice = mergeHookSettings(once);
  assert.equal(twice.added.length, 0);
  assert.equal(twice.settings.hooks.PreToolUse.length, 1);
  assert.equal(twice.settings.hooks.Stop.length, 1);
});
