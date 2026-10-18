/* Claude가 한국어를 쓰는 요청마다 korean-rewrite skill을 부르게 하는 hook 테스트입니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_SKILL_DENIALS,
  SKILL_MISSING,
  agentTranscriptPath,
  currentTurn,
  hangulCount,
  needsSkill,
  skillRequest,
  usedSkill,
} from '../scripts/lib/skill.mjs';
import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';

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
