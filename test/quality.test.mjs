import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';
import { checkText, blockingViolations } from '../scripts/lib/check.mjs';
import { targetForPath } from '../scripts/lib/targets.mjs';
import { answersOf, assessAnswer, formatSummary, summarize } from '../scripts/eval-korean.mjs';

const rulesPath = fileURLToPath(new URL('../docs/rules.md', import.meta.url));
const rules = loadRules(rulesPath);

const natural = [
  '문을 통해 들어갑니다.',
  '책을 가지고 있습니다.',
  '예전에는 서울에 살았었습니다.',
  '디스크에서 자리를 차지하는 파일입니다.',
  '하지만, 이 경우에는 별도로 확인할 필요가 있습니다.',
  '이 방법은 요청이 성공하는 것을 보장하지 않습니다.',
];
for (const text of natural) test(`문맥을 봐야 판단할 수 있는 표현에는 경고만 하고 막지 않는다: ${text}`, () => {
  const findings = checkText(text, rules);
  assert.ok(findings.some(v => v.severity === 'warning'), '경고는 남깁니다');
  assert.equal(blockingViolations(findings).length, 0);
});

test('실제 표기 오류와 이중피동은 계속 막는다', () => {
  assert.ok(blockingViolations(checkText('작업이 완료됬습니다.', rules)).some(v => v.rule === 'known-typo'));
  assert.equal(blockingViolations(checkText('작업이 완료됐습니다.', rules)).length, 0);
  assert.ok(blockingViolations(checkText('결과가 보여집니다.', rules)).some(v => v.rule === 'double-passive'));
});

test('영어 기술 용어가 많아도 용어 수를 줄이라고 요구하지 않는다', () => {
  const text = 'React가 API를 호출하고 Redis를 조회하며 worker가 PostgreSQL을 쓰고 Docker로 실행합니다.';
  assert.ok(!checkText(text, rules).some(v => v.rule === 'bound-english'));
});

test('산문의 가운뎃점과 줄표는 막고 백틱으로 감싼 문자와 대신 쓴 표현은 허용한다', () => {
  for (const target of ['chat', 'doc']) {
    for (const char of ['\u00b7', '\u2014']) {
      assert.ok(blockingViolations(checkText(`API${char}DB를 확인합니다.`, rules, target))
        .some(v => v.rule === 'banned-char'));
      assert.equal(blockingViolations(checkText(`문자 코드 예시는 \`${char}\`입니다.`, rules, target)).length, 0);
    }
    for (const text of ['API와 DB를 확인합니다.', 'API를 확인합니다. DB도 확인합니다.', 'API를 확인합니다(DB 포함).']) {
      assert.equal(blockingViolations(checkText(text, rules, target)).length, 0);
    }
  }
});

test('hook이 Claude에게 알릴 규칙은 모두 경고 규칙이고 규칙 이름 표에 있다', () => {
  /* 오류 규칙을 넣으면 쓰기가 막혀 알릴 기회가 없습니다. 이름을 잘못 적으면 그 규칙의 알림이 아무 표시 없이 꺼집니다. */
  const reported = new Set([...readFileSync(rulesPath, 'utf8').matchAll(/^\| `([a-z-]+)` \|/gm)].map(m => m[1]));
  assert.ok(rules.reviewRules.length > 0);
  for (const name of rules.reviewRules) {
    assert.ok(rules.advisoryRules.includes(name), `${name} 규칙은 경고 규칙이 아닙니다`);
    assert.ok(reported.has(name), `${name} 규칙은 규칙 이름 표에 없습니다`);
  }
});

test('기본 규칙에서는 `_workspace/` 아래의 작업 파일을 검사하지 않는다', () => {
  for (const path of ['_workspace/run/note.md', 'docs/_workspace/draft.md']) {
    assert.equal(targetForPath(path, rules), null, path);
  }
  for (const path of ['docs/workspace.md', 'docs/_workspace.md', 'README.md']) {
    assert.equal(targetForPath(path, rules), 'doc', path);
  }
});

test('경고로 둘 규칙은 규칙 문서에서 정하고 앞서 파싱한 결과는 다음 파싱에 섞이지 않는다', () => {
  const warn = parseRuleBlock('advisory-rules: translationese\ntranslationese-patterns: 를 통해=~해');
  const strict = parseRuleBlock('translationese-patterns: 를 통해=~해');
  assert.equal(blockingViolations(checkText('API를 통해 확인합니다.', warn)).length, 0);
  assert.equal(blockingViolations(checkText('API를 통해 확인합니다.', strict)).length, 1);
  assert.deepEqual(strict.advisoryRules, []);
});

test('실제 모델로 평가할 때 답변이 빠지거나 중복되거나 제약을 어기면 통과라고 보고하지 않는다', () => {
  assert.throws(() => answersOf('<answer id="a">응답</answer>', [{ id: 'a' }, { id: 'b' }]), /답변이 없거나 중복되었습니다: b/);
  assert.throws(() => answersOf('<answer id="a">첫째</answer><answer id="a">둘째</answer>', [{ id: 'a' }]), /답변이 없거나 중복되었습니다: a/);
  const score = assessAnswer({ id: 'a', text: '끝났습니다.' }, { must: ['API'], maxChars: 3, sentences: 2 });
  assert.deepEqual(score.missing, ['API']);
  assert.equal(score.overLength, true);
  assert.equal(score.wrongSentenceCount, true);
  assert.equal(assessAnswer({ text: '확인했습니다.\n(1문장)' }, { must: [], maxChars: 100 }).metaComment, true);
  const modal = { must: [], mustAny: [['수 있', '가능성']], maxChars: 100 };
  assert.equal(assessAnswer({ text: '오류가 줄어듭니다.' }, modal).missing.length, 1);
  assert.equal(assessAnswer({ text: '오류가 줄어들 수 있습니다.' }, modal).missing.length, 0);
  const calque = { must: [], mustNot: ['것을 허용'], maxChars: 100 };
  assert.deepEqual(assessAnswer({ text: '사용자가 데이터를 내보내는 것을 허용합니다.' }, calque).forbidden, ['것을 허용']);
  assert.deepEqual(assessAnswer({ text: '사용자가 데이터를 내보낼 수 있습니다.' }, calque).forbidden, []);
  assert.deepEqual(assessAnswer({ text: '끝났습니다.' }, { must: [], maxChars: 100 }).forbidden, []);
});

test('저장된 평가 결과에서 프로필마다 항목을 세어 README에 옮길 표로 만든다', () => {
  const rows = [
    { profile: 'baseline', skills: [], costUsd: 0.04, seconds: 10, answers: [{ id: 'a', text: '확인했어요. ✅' }] },
    { profile: 'baseline', skills: [], costUsd: 0.06, seconds: 12, hookResponses: [{ event: 'Stop', output: 'JSON이 아닌 출력', exitCode: 0 }], answers: [{ id: 'b', text: '분류·정리를 마쳤습니다.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>' }] },
    { profile: 'installed', skills: ['korean-rewrite'], costUsd: 0.08, seconds: 15, hookResponses: [{ event: 'Stop', output: '{"decision":"block","reason":"다시 쓰십시오."}', exitCode: 0 }, { event: 'Stop', output: '', exitCode: 0 }], answers: [{ id: 'a', text: '확인했습니다.' }] },
    { profile: 'installed', skills: ['korean-rewrite'], costUsd: 0.1, seconds: 17, hookResponses: [{ event: 'PreToolUse', output: '{"decision":"block"}', exitCode: 0 }], answers: [{ id: 'b', text: '`확인해요`라는 문장을 지웠습니다.' }] },
  ];
  const summary = summarize(rows, rules);
  assert.deepEqual(summary.baseline, { answers: 2, skill: 0, rewritten: 0, errors: 2, register: 1, emoji: 1, middot: 1, attribution: 1, chars: [...rows[0].answers[0].text].length + [...rows[1].answers[0].text].length, costUsd: 0.1, seconds: 22 });
  assert.equal(summary.installed.skill, 2);
  assert.equal(summary.installed.rewritten, 1, 'Stop hook이 다시 쓰게 한 기록만 셉니다');
  assert.equal(summary.installed.errors, 0, '인라인 코드로 감싼 해요체 예문은 세지 않습니다');
  assert.equal(summary.installed.register, 0);
  const table = formatSummary(summary);
  assert.match(table, /^\| 항목 \| 이 도구가 없는 프로젝트 \| 이 도구를 설치한 프로젝트 \|$/m);
  assert.match(table, /^\| skill을 거친 답변 \| 2개 중 0개 \| 2개 중 2개 \|$/m);
  assert.match(table, /^\| Stop hook이 다시 쓰게 한 답변 \| 2개 중 0개 \| 2개 중 1개 \|$/m);
  assert.match(table, /^\| 검사기가 오류를 찾은 답변 \| 2개 중 2개 \| 2개 중 0개 \|$/m);
  assert.match(table, /^\| 답변 하나에 든 평균 비용 \| 0\.050달러 \| 0\.090달러 \|$/m);
  assert.match(table, /^\| 답변 하나를 받는 데 걸린 평균 시간 \| 11\.0초 \| 16\.0초 \|$/m);
});

test('평가 결과를 셀 때 답변이 없는 프로필과 잘못된 입력을 그대로 표에 싣지 않고 프로필 이름이 `__proto__`여도 다른 객체를 건드리지 않는다', () => {
  const summary = summarize([{ profile: 'installed', costUsd: 0.1, seconds: 3, answers: [] }], rules);
  assert.match(formatSummary(summary), /^\| 답변 하나에 든 평균 비용 \| - \|$/m);
  assert.throws(() => formatSummary(summarize([], rules)), /답변이 없습니다/);
  assert.throws(() => summarize([{ profile: 'baseline' }], rules), /answers/);
  const proto = summarize([{ profile: '__proto__', costUsd: 1, seconds: 1, answers: [{ id: 'a', text: '확인했습니다.' }] }], rules);
  assert.equal(proto.__proto__.answers, 1);
  assert.equal(({}).answers, undefined, '다른 객체에 속성이 생기면 안 됩니다');
});

test('세션마다 시스템 프롬프트에 들어가는 작성 지침의 분량을 제한한다', () => {
  const style = readFileSync(new URL('../output-styles/korean-style.md', import.meta.url), 'utf8');
  assert.ok([...style].length <= 1600, '긴 설명은 skill이나 docs/ 아래 문서에 둡니다');
  assert.match(style, /keep-coding-instructions: true/);
});

test('작성 지침에는 처음부터 한국어로 생각하라는 지시와 생성 표시를 넣지 말라는 지시가 들어 있다', () => {
  /* 작성 지침이 영어이거나 어느 언어로 생각할지 적혀 있지 않으면 Claude는 영어로 구상한 뒤 한국어로 옮기기 쉽습니다. */
  const style = readFileSync(new URL('../output-styles/korean-style.md', import.meta.url), 'utf8');
  assert.match(style, /한국어로 생각합니다/);
  assert.match(style, /Generated with \[Claude Code\]/);
});
