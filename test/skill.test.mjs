/* Claude가 한국어를 쓰는 요청마다 korean-rewrite skill을 부르게 하는 hook 테스트입니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_SKILL_DENIALS,
  MAX_WRITER_DENIALS,
  SKILL_MISSING,
  WRITER_MISSING,
  agentTranscriptPath,
  currentTurn,
  hangulCount,
  needsSkill,
  needsWriter,
  skillRequest,
  usedSkill,
  writerRequest,
} from '../scripts/lib/skill.mjs';
import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';
import { skillReminder } from '../scripts/hooks/userprompt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = loadRules(join(ROOT, 'docs', 'rules.md'));
const scratch = () => mkdtempSync(join(tmpdir(), 'korean-style-skill-'));

/* 한글이 기준(20자)보다 많고 검사기가 찾을 오류도 없는 문장입니다. */
const KOREAN = '설치 스크립트를 다시 실행한 뒤 Claude Code를 다시 시작하면 새 설정이 적용됩니다.';

const prompt = (text) => ({ type: 'user', message: { content: text } });
const said = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const called = (input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input }] } });
const result = (content) => ({ type: 'user', message: { content: [{ type: 'tool_result', content }] } });
const skillBody = () => ({ type: 'user', isMeta: true, message: { content: [{ type: 'text', text: 'Base directory for this skill: /tmp' }] } });
const SKILL_CALL = [called({ skill: 'korean-rewrite' }), result('Launching skill: korean-rewrite'), skillBody()];

/* 한글이 작성 agent 기준(200자)보다 많고 검사기가 찾을 오류도 없는 글입니다. */
const LONG_KOREAN = [
  KOREAN,
  '규칙 문서는 저장소에 커밋하므로 팀원이 설치 명령을 한 번 실행하면 같은 규칙이 적용됩니다.',
  '검사기는 모델을 부르지 않으므로 같은 글을 같은 규칙으로 검사하면 결과가 늘 같습니다.',
  '경고는 문맥에 맞으면 그대로 두어도 되고 오류만 고치면 hook이 쓰기를 막지 않습니다.',
  '커밋 메시지는 Git의 commit-msg hook도 검사하므로 사람이 직접 하는 커밋에도 같은 규칙이 적용됩니다.',
  '설치한 뒤에는 doctor를 실행해 hook, skill, 작성 agent가 제자리에 있는지 확인합니다.',
  '작성 agent는 메모에 적힌 사실만으로 글을 쓰고 완성한 글만 돌려줍니다.',
].join(' ');

/* Agent 도구나 예전 이름인 Task 도구로 agent를 부른 기록과 그 결과입니다. */
const delegated = (name, id = 'w1', tool = 'Agent') =>
  ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: tool, input: { subagent_type: name, description: '글 쓰기', prompt: '메모입니다' } }] } });
const delegatedResult = (id = 'w1', isError = false) =>
  ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: isError ? "Agent type 'korean-writer' not found" : '돌려받은 글입니다.' }] } });
const WRITER_CALL = [delegated('korean-writer'), delegatedResult()];

function transcript(entries, path = join(scratch(), 'session.jsonl')) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf-8');
  return path;
}

/* hook을 실제로 띄우고 stdout을 JSON으로 읽습니다. */
function runHook(script, input, env = {}) {
  const r = spawnSync('node', [join(ROOT, 'scripts', 'hooks', script)], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    cwd: ROOT,
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
  });
  assert.equal(r.status, 0, `hook은 언제나 종료 코드 0으로 끝나야 합니다. 이번에는 ${r.status}입니다.`);
  const out = (r.stdout ?? '').trim();
  return out.length === 0 ? null : JSON.parse(out);
}

const context = (path, extra = {}) => ({ text: KOREAN, rules: RULES, projectRoot: ROOT, transcriptPath: path, ...extra });

test('규칙 문서에서 `writing-skill`과 `writing-skill-min-hangul`을 읽는다', () => {
  assert.equal(RULES.writingSkill, 'korean-rewrite');
  assert.equal(RULES.writingSkillMinHangul, 20);
  const off = parseRuleBlock('writing-skill:\n');
  assert.equal(off.writingSkill, '', '값을 비우면 skill을 요구하지 않습니다');
});

test('`writing-skill`과 `writing-skill-min-hangul`이 없는 예전 규칙에서도 korean-rewrite skill을 요구한다', () => {
  /* 직접 고친 규칙은 다시 설치해도 바뀌지 않으므로 새 키가 들어가지 않습니다. */
  const old = parseRuleBlock('register: 다나까체\nbanned-address: 당신\n');
  assert.equal(old.writingSkill, 'korean-rewrite');
  assert.equal(old.writingSkillMinHangul, 20);
});

test('이번 요청은 사용자가 직접 보낸 마지막 메시지 뒤에서 시작한다', () => {
  const path = transcript([prompt('지난 질문입니다'), said('지난 답변입니다'), prompt('이번 질문입니다'), ...SKILL_CALL, said('이번 답변입니다')]);
  const entries = currentTurn(path);
  assert.ok(entries.every((entry) => JSON.stringify(entry).includes('지난') === false), '지난 요청이 섞이면 안 됩니다');
  assert.ok(usedSkill(entries, 'korean-rewrite'), 'skill 본문이 든 줄을 요청의 시작으로 보면 skill 호출을 놓칩니다');
});

test('백그라운드 agent가 끝났다는 알림은 이번 요청의 시작으로 보지 않는다', () => {
  /* 작성 agent를 백그라운드로 부르면 결과는 `origin.kind`가 `task-notification`인 사용자 메시지로 돌아옵니다. 이 알림을 요청의 시작으로 보면 agent를 부른 기록이 이전 요청에 남습니다. 그러면 Claude가 결과를 받아 글을 쓸 때 hook이 다시 막습니다. */
  const notice = { type: 'user', origin: { kind: 'task-notification' }, message: { content: '<task-notification>작업을 마쳤습니다.</task-notification>' } };
  const path = transcript([prompt('README를 고쳐 주십시오'), ...SKILL_CALL, ...WRITER_CALL, notice]);
  assert.ok(!needsWriter(context(path, { text: LONG_KOREAN })));
  assert.ok(!needsSkill(context(path)));
  const human = transcript([prompt('README를 고쳐 주십시오'), ...SKILL_CALL, ...WRITER_CALL, { ...notice, origin: { kind: 'human' } }]);
  assert.ok(needsWriter(context(human, { text: LONG_KOREAN })), '사용자가 보낸 메시지는 새 요청의 시작입니다');
});

test('이름이 같은 skill을 부른 경우만 인정한다', () => {
  assert.ok(usedSkill([called({ skill: '/korean-rewrite' })], 'korean-rewrite'));
  assert.ok(usedSkill([called({ command: 'korean-rewrite' })], 'korean-rewrite'));
  assert.ok(!usedSkill([called({ skill: 'korean-style' })], 'korean-rewrite'));
  assert.ok(!usedSkill([said('korean-rewrite skill을 쓰겠습니다.')], 'korean-rewrite'), '말로만 언급한 것은 호출이 아닙니다');
});

test('이번 요청에서 skill을 부르지 않고 한국어를 쓰면 skill을 요구한다', () => {
  assert.ok(needsSkill(context(transcript([prompt('질문입니다'), said('살펴보겠습니다.')]))));
  assert.ok(!needsSkill(context(transcript([prompt('질문입니다'), ...SKILL_CALL]))));
});

test('한글이 기준보다 적은 글이나 영어로만 쓴 글에는 skill을 요구하지 않는다', () => {
  const path = transcript([prompt('질문입니다')]);
  assert.equal(hangulCount('확인했습니다.'), 6);
  assert.ok(!needsSkill(context(path, { text: '확인했습니다.' })));
  assert.ok(!needsSkill(context(path, { text: 'The installer finished and every hook is in place.' })));
});

test('skill이 설치되지 않았거나 규칙에서 꺼져 있거나 대화 기록을 읽을 수 없으면 skill을 요구하지 않는다', () => {
  const path = transcript([prompt('질문입니다')]);
  assert.ok(!needsSkill(context(path, { projectRoot: scratch() })), 'skill 파일이 없는 프로젝트입니다');
  assert.ok(!needsSkill(context(path, { rules: { ...RULES, writingSkill: '' } })));
  assert.ok(!needsSkill(context(join(scratch(), '없음.jsonl'))));
});

test('같은 요청에서 정해 둔 횟수만큼 막았으면 더 막지 않는다', () => {
  /* Skill 도구를 쓸 수 없는 환경에서 끝없이 막히는 일을 막습니다. */
  /* hook이 실제로 막을 때 쓰는 문구로 대화 기록을 만듭니다. 막은 횟수를 셀 때 찾는 문구가 이 문구와 달라지면 이 테스트가 실패합니다. */
  const denied = Array.from({ length: MAX_SKILL_DENIALS }, () => result(skillRequest('korean-rewrite', '다시 쓰십시오.')));
  assert.ok(needsSkill(context(transcript([prompt('질문입니다'), ...denied.slice(1)]))));
  assert.ok(!needsSkill(context(transcript([prompt('질문입니다'), ...denied]))));
});

test('subagent가 쓸 때는 그 subagent의 대화 기록에서 skill 호출을 찾는다', () => {
  const dir = scratch();
  const main = transcript([prompt('질문입니다'), ...SKILL_CALL], join(dir, 'session.jsonl'));
  const agentPath = agentTranscriptPath(main, 'a1b2c3');
  assert.equal(agentPath, join(dir, 'session', 'subagents', 'agent-a1b2c3.jsonl'));
  transcript([prompt('subagent에게 준 작업입니다')], agentPath);
  assert.ok(needsSkill(context(main, { agentId: 'a1b2c3' })), '메인 세션에서 부른 skill은 subagent에게 전해지지 않습니다');
  transcript([prompt('subagent에게 준 작업입니다'), ...SKILL_CALL], agentPath);
  assert.ok(!needsSkill(context(main, { agentId: 'a1b2c3' })));
  assert.equal(agentTranscriptPath(main, '../x'), null, 'subagents 디렉터리 밖을 가리킬 수 있는 id는 쓰지 않습니다');
});

test('프롬프트마다 korean-rewrite skill을 먼저 부르라고 알린다', () => {
  const out = runHook('userprompt.mjs', { prompt: '설치 안내를 써 주십시오' });
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /Skill 도구로 korean-rewrite skill/);
});

test('`writing-skill`을 비운 규칙에서는 프롬프트에 아무것도 덧붙이지 않는다', () => {
  const dir = scratch();
  const rules = join(dir, 'rules.md');
  writeFileSync(rules, '```korean-style-rules\nregister: 다나까체\nwriting-skill:\n```\n', 'utf-8');
  assert.equal(runHook('userprompt.mjs', { prompt: '질문입니다' }, { KOREAN_STYLE_RULES: rules }), null);
});

test('skill을 부르지 않고 한국어 문서를 쓰면 막고 부른 뒤에는 막지 않는다', () => {
  const input = (path) => ({
    tool_name: 'Write',
    tool_input: { file_path: join(ROOT, 'docs', 'skill-test.md'), content: `${KOREAN}\n` },
    transcript_path: path,
  });
  const denied = runHook('pretooluse.mjs', input(transcript([prompt('문서를 써 주십시오')])));
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(denied.hookSpecificOutput.permissionDecisionReason.includes(SKILL_MISSING));
  assert.equal(runHook('pretooluse.mjs', input(transcript([prompt('문서를 써 주십시오'), ...SKILL_CALL]))), null);
});

test('영어 문서와 프로젝트 밖의 파일은 skill 없이도 쓸 수 있다', () => {
  const path = transcript([prompt('문서를 써 주십시오')]);
  const english = { tool_name: 'Write', tool_input: { file_path: join(ROOT, 'docs', 'skill-test.md'), content: 'The installer finished.\n' }, transcript_path: path };
  assert.equal(runHook('pretooluse.mjs', english), null);
  const outside = { tool_name: 'Write', tool_input: { file_path: join(scratch(), 'note.md'), content: `${KOREAN}\n` }, transcript_path: path };
  assert.equal(runHook('pretooluse.mjs', outside), null);
});

test('skill을 부르지 않고 한국어 커밋 메시지로 커밋하면 막는다', () => {
  const command = `git commit -m "docs: 설치 안내 정리" -m "${KOREAN}"`;
  const denied = runHook('pretooluse.mjs', { tool_name: 'Bash', tool_input: { command }, transcript_path: transcript([prompt('커밋해 주십시오')]) });
  assert.ok(denied.hookSpecificOutput.permissionDecisionReason.includes('다시 커밋하십시오'));
  const allowed = runHook('pretooluse.mjs', { tool_name: 'Bash', tool_input: { command }, transcript_path: transcript([prompt('커밋해 주십시오'), ...SKILL_CALL]) });
  assert.equal(allowed, null);
});

test('skill을 부르지 않고 한국어 PR 설명을 올리면 막는다', () => {
  const command = `gh pr create --title "설치 안내 정리" --body "${KOREAN}"`;
  const denied = runHook('pretooluse.mjs', { tool_name: 'Bash', tool_input: { command }, transcript_path: transcript([prompt('PR을 올려 주십시오')]) });
  assert.ok(denied.hookSpecificOutput.permissionDecisionReason.includes(SKILL_MISSING));
  const allowed = runHook('pretooluse.mjs', { tool_name: 'Bash', tool_input: { command }, transcript_path: transcript([prompt('PR을 올려 주십시오'), ...SKILL_CALL]) });
  assert.equal(allowed, null);
});

test('skill을 부르지 않고 마친 한국어 답변이면 skill을 부르고 다시 쓰라고 요구한다', () => {
  const path = transcript([prompt('설치 방법을 알려 주십시오'), said(KOREAN)]);
  const out = runHook('stop.mjs', { transcript_path: path, last_assistant_message: KOREAN, stop_hook_active: false });
  assert.equal(out.decision, 'block');
  assert.ok(out.reason.includes(SKILL_MISSING));
  assert.ok(out.reason.includes('답변을 다시 쓰십시오'));
});

test('skill을 거친 답변이나 이미 한 번 다시 쓴 답변이면 다시 쓰라고 요구하지 않는다', () => {
  const used = transcript([prompt('설치 방법을 알려 주십시오'), ...SKILL_CALL, said(KOREAN)]);
  assert.equal(runHook('stop.mjs', { transcript_path: used, last_assistant_message: KOREAN, stop_hook_active: false }), null);
  const skipped = transcript([prompt('설치 방법을 알려 주십시오'), said(KOREAN)]);
  assert.equal(runHook('stop.mjs', { transcript_path: skipped, last_assistant_message: KOREAN, stop_hook_active: true }), null);
});

test('skill도 부르지 않고 오류도 있으면 두 가지를 함께 알린다', () => {
  const text = `${KOREAN} 작업이 완료됬습니다.`;
  const path = transcript([prompt('설치 방법을 알려 주십시오'), said(text)]);
  const out = runHook('stop.mjs', { transcript_path: path, last_assistant_message: text, stop_hook_active: false });
  assert.ok(out.reason.includes(SKILL_MISSING));
  assert.match(out.reason, /known-typo/);
});

test('규칙 문서에서 `writer-agent`와 `writer-agent-min-hangul`을 읽고 값을 비우면 agent를 요구하지 않는다', () => {
  /* 두 키의 기본값은 `korean-writer`와 200입니다. 답변 기준인 `writer-agent-answer-min-hangul`의 기본값은 0입니다. `writer-agent:`처럼 값을 비우면 빈 문자열이 되어 agent를 요구하지 않고 세 키가 없는 예전 규칙에서도 기본값을 씁니다. */
  assert.equal(RULES.writerAgent, 'korean-writer');
  assert.equal(RULES.writerAgentMinHangul, 200);
  assert.equal(RULES.writerAgentAnswerMinHangul, 0);
  assert.equal(parseRuleBlock('writer-agent:\n').writerAgent, '');
  const old = parseRuleBlock('register: 다나까체\nbanned-address: 당신\n');
  assert.equal(old.writerAgent, 'korean-writer');
  assert.equal(old.writerAgentMinHangul, 200);
  assert.equal(old.writerAgentAnswerMinHangul, 0);
});

test('`needsWriter`는 한글이 200자 이상인 글을 쓰는데 이번 요청에서 `korean-writer` agent를 부르지 않았을 때만 true를 돌려준다', () => {
  /* Agent 도구나 예전 이름인 Task 도구로 `subagent_type`이 `korean-writer`인 호출이 있으면 false입니다. 실패한 호출은 부른 것으로 보지 않습니다. 한글이 200자보다 적거나, agent 파일이 없거나, subagent가 쓰는 글이거나, 같은 요청에서 이미 두 번 막았을 때도 false입니다. */
  assert.ok(hangulCount(LONG_KOREAN) >= RULES.writerAgentMinHangul);
  const writing = (path, extra = {}) => context(path, { text: LONG_KOREAN, ...extra });
  const skipped = transcript([prompt('README를 고쳐 주십시오'), ...SKILL_CALL]);
  assert.ok(needsWriter(writing(skipped)));
  for (const tool of ['Agent', 'Task']) {
    const path = transcript([prompt('README를 고쳐 주십시오'), delegated('korean-writer', 'w1', tool), delegatedResult('w1')]);
    assert.ok(!needsWriter(writing(path)), tool);
  }
  assert.ok(needsWriter(writing(transcript([prompt('README를 고쳐 주십시오'), delegated('korean-reviewer'), delegatedResult()]))), '다른 agent를 부른 것은 맡긴 것이 아닙니다');
  assert.ok(needsWriter(writing(transcript([prompt('README를 고쳐 주십시오'), delegated('korean-writer'), delegatedResult('w1', true)]))), '오류로 끝난 호출');
  assert.ok(!needsWriter(writing(skipped, { text: KOREAN })), '한글이 200자보다 적은 글');
  assert.ok(!needsWriter(writing(skipped, { projectRoot: scratch() })), 'agent 파일이 없는 프로젝트');
  assert.ok(!needsWriter(writing(skipped, { agentId: 'a1b2c3' })), 'subagent가 쓰는 글');
  assert.ok(!needsWriter(writing(skipped, { rules: { ...RULES, writerAgent: '' } })), '`writer-agent`를 비운 규칙');
  assert.ok(!needsWriter(writing(skipped, { minHangul: 0 })), '기준이 0인 글');
  /* hook이 실제로 막을 때 쓰는 문구로 대화 기록을 만듭니다. 막은 횟수를 셀 때 찾는 문구가 이 문구와 달라지면 이 테스트가 실패합니다. */
  const denied = Array.from({ length: MAX_WRITER_DENIALS }, () => result(writerRequest('korean-writer', 200, '다시 쓰십시오.')));
  assert.ok(denied.every((entry) => entry.message.content[0].content.includes(WRITER_MISSING)));
  assert.ok(needsWriter(writing(transcript([prompt('README를 고쳐 주십시오'), ...denied.slice(1)]))));
  assert.ok(!needsWriter(writing(transcript([prompt('README를 고쳐 주십시오'), ...denied]))));
});

test('`korean-writer` agent를 불렀으면 `korean-rewrite` skill을 부르지 않아도 `needsSkill`은 false를 돌려준다', () => {
  /* 작성 agent의 frontmatter에 이 skill을 미리 불러오도록 적어 두었으므로 이번 요청에서 agent를 불렀으면 skill을 따로 부르지 않았어도 `needsSkill`이 false입니다. */
  assert.ok(needsSkill(context(transcript([prompt('README를 고쳐 주십시오')]))));
  assert.ok(!needsSkill(context(transcript([prompt('README를 고쳐 주십시오'), ...WRITER_CALL]))));
});

test('PreToolUse hook은 agent를 부르지 않은 요청에서 한글이 200자 이상인 Write를 막는다', () => {
  /* 막는 이유에는 agent 이름과 메모에 적을 항목(독자, 글 종류, 말투, 담을 사실)이 들어 있습니다. agent를 부른 요청에서는 막지 않습니다. */
  const input = (path) => ({
    tool_name: 'Write',
    tool_input: { file_path: join(ROOT, 'docs', 'writer-test.md'), content: `${LONG_KOREAN}\n` },
    transcript_path: path,
  });
  const denied = runHook('pretooluse.mjs', input(transcript([prompt('문서를 써 주십시오'), ...SKILL_CALL])));
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  const reason = denied.hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.includes(WRITER_MISSING));
  for (const word of ['korean-writer', '독자', '글 종류', '말투', '담을 사실']) assert.ok(reason.includes(word), word);
  assert.equal(runHook('pretooluse.mjs', input(transcript([prompt('문서를 써 주십시오'), ...WRITER_CALL]))), null);
  const short = { ...input(transcript([prompt('문서를 써 주십시오'), ...SKILL_CALL])), tool_input: { file_path: join(ROOT, 'docs', 'writer-test.md'), content: `${KOREAN}\n` } };
  assert.equal(runHook('pretooluse.mjs', short), null, '한글이 200자보다 적은 글은 skill만 부르면 됩니다');
});

test('Stop hook은 `writer-agent-answer-min-hangul`이 0이면 답변을 agent에게 맡기라고 하지 않고 0보다 크면 agent를 부르지 않은 긴 답변을 다시 쓰게 한다', () => {
  /* 기본 규칙에서는 답변을 맡기지 않으므로 skill을 거친 긴 답변은 그대로 둡니다. 답변 기준을 200으로 바꾼 규칙에서는 agent를 부르지 않은 긴 답변을 다시 쓰게 하고 agent를 부른 요청의 답변은 그대로 둡니다. */
  const skipped = transcript([prompt('설치 방법을 알려 주십시오'), ...SKILL_CALL, said(LONG_KOREAN)]);
  const stop = (path, env) => runHook('stop.mjs', { transcript_path: path, last_assistant_message: LONG_KOREAN, stop_hook_active: false }, env);
  assert.equal(stop(skipped), null);
  const rules = join(scratch(), 'rules.md');
  writeFileSync(rules, readFileSync(join(ROOT, 'docs', 'rules.md'), 'utf-8').replace(/^writer-agent-answer-min-hangul: 0$/m, 'writer-agent-answer-min-hangul: 200'), 'utf-8');
  const out = stop(skipped, { KOREAN_STYLE_RULES: rules });
  assert.equal(out.decision, 'block');
  assert.ok(out.reason.includes(WRITER_MISSING));
  assert.ok(out.reason.includes('답변을 다시 쓰십시오'));
  const delegatedTurn = transcript([prompt('설치 방법을 알려 주십시오'), ...WRITER_CALL, said(LONG_KOREAN)]);
  assert.equal(stop(delegatedTurn, { KOREAN_STYLE_RULES: rules }), null);
});

test('UserPromptSubmit hook은 agent 파일이 있을 때만 안내에 agent 이름과 기준 길이를 넣는다', () => {
  /* agent 파일이 있으면 안내에 agent 이름과 기준 길이가 들어가고 없으면 들어가지 않습니다. 답변 기준이 0이면 답변은 안내에 넣지 않습니다. 안내는 돌려받은 글에서 `빠진 정보:` 줄을 빼라고도 알립니다. */
  const out = runHook('userprompt.mjs', { prompt: '설치 안내를 써 주십시오' });
  assert.match(out.hookSpecificOutput.additionalContext, /파일, 커밋 메시지, PR과 이슈에 올리는 글은 한 번에 쓰는 한글이 200자 이상이면 직접 쓰지 말고 Agent 도구로 korean-writer에게/);
  assert.match(out.hookSpecificOutput.additionalContext, /`빠진 정보:` 줄은 빼고/);
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /답변은 한글이/);
  assert.doesNotMatch(skillReminder('korean-rewrite'), /korean-writer/);
  assert.match(skillReminder('korean-rewrite', 'korean-writer', 200, 300), /200자 이상이면, 답변은 한글이 300자 이상이면 직접 쓰지 말고/);
});

test('PreToolUse hook은 질문, 계획, 소스 파일의 문자열에는 작성 agent를 요구하지 않고 소스 파일의 긴 주석에는 요구한다', () => {
  /* 작성 agent는 대화에 쓰는 글과 코드를 맡지 않습니다. 그래서 한글이 200자 이상인 계획과 질문도 skill만 부르면 막지 않습니다. 소스 파일에서는 주석의 한글만 셉니다. */
  const turn = transcript([prompt('계획을 세워 주십시오'), ...SKILL_CALL]);
  assert.equal(runHook('pretooluse.mjs', { tool_name: 'ExitPlanMode', tool_input: { plan: LONG_KOREAN }, transcript_path: turn }), null);
  assert.equal(runHook('pretooluse.mjs', { tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: `${LONG_KOREAN} 어떻게 하시겠습니까?`, header: '확인', options: [{ label: '진행', description: '진행합니다.' }, { label: '중단', description: '중단합니다.' }], multiSelect: false }] }, transcript_path: turn }), null);
  const source = `export const MESSAGES = ${JSON.stringify(LONG_KOREAN.split(' '))};\n`;
  assert.equal(runHook('pretooluse.mjs', { tool_name: 'Write', tool_input: { file_path: join(ROOT, 'scripts', 'writer-test.mjs'), content: source }, transcript_path: turn }), null);
  const commented = `/* ${LONG_KOREAN} */\nexport const x = 1;\n`;
  const denied = runHook('pretooluse.mjs', { tool_name: 'Write', tool_input: { file_path: join(ROOT, 'scripts', 'writer-test.mjs'), content: commented }, transcript_path: turn });
  assert.ok(denied.hookSpecificOutput.permissionDecisionReason.includes(WRITER_MISSING), '주석의 한글이 200자 이상이면 작성 agent를 요구합니다');
});
