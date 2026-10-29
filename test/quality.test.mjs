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

test('영어를 낱말 단위로 옮겨 만든 말은 답변, 문서, 커밋 메시지에서 막고 풀어 쓴 말과 굳은 말, 코드나 따옴표로 감싼 말은 답변에서 막지 않는다', () => {
  /* 이 도구를 설치하고 skill을 부른 세션에서 Claude가 `untracked`를 `미추적`으로 옮겨 썼습니다. 사용자는 Claude가 `비멱등`이라고 쓴 답변을 보았다고 알려 왔습니다. */
  for (const target of ['chat', 'doc', 'commit']) {
    for (const text of ['비멱등 요청은 다시 보내면 안 됩니다.', 'POST는 비멱등이라 재시도하지 않습니다.', 'main checkout의 미추적 file 2개를 지웠습니다.']) {
      assert.ok(blockingViolations(checkText(text, rules, target)).some(v => v.rule === 'calque'), `${target}: ${text}`);
    }
  }
  for (const text of [
    '멱등하지 않은 요청은 다시 보내면 안 됩니다.',
    '멱등성 키를 확인해야 합니다.',
    '추적하지 않는 파일 2개가 남았습니다.',
    '비동기 호출과 비활성화 버튼을 고쳤습니다.',
    "'비멱등'이라는 말은 사전에 없습니다.",
    '`미추적` 대신 추적하지 않는 파일이라고 씁니다.',
    '사용자가 보낸 로그입니다.\n\n```text\n비멱등 요청은 재시도하지 않습니다.\n```',
  ]) {
    assert.ok(!checkText(text, rules).some(v => v.rule === 'calque'), text);
  }
});

test('항목을 새로 넣는 일을 `더하다`로 쓴 문장은 경고로 알리고 다른 뜻으로 쓴 `더하다`는 알리지 않는다', () => {
  /* 첫 문장은 사용자가 알려 온 답변과 같은 꼴로 만든 문장입니다. 나머지 세 문장은 Claude가 이 도구를 설치한 세션에서 쓰거나 이 저장소의 지침에 쓴 문장입니다. */
  for (const text of [
    '검색 대상에 사내 위키 저장소(docs/wiki)를 더하면 장애 대응 절차까지 답할 수 있습니다.',
    '같은 방식으로 회귀 테스트 두 개를 더합니다.',
    '이제 이 동작을 검증하는 test를 더하겠습니다.',
    '동작을 바꾸면 회귀 테스트를 더하고 `npm run gate`를 통과시킵니다.',
  ]) {
    const found = checkText(text, rules);
    assert.ok(found.some(v => v.rule === 'literal-verb' && v.severity === 'warning'), text);
    assert.equal(blockingViolations(found).length, 0, text);
  }
  for (const text of [
    '상품 가격에 배송비를 더하면 총액이 됩니다.',
    '답변 24개의 길이를 모두 더하면 19,271자입니다.',
    '공통 규칙에 더해 호칭 규칙도 검사합니다.',
    '밀도 규칙이 한도에 더하는 여유입니다.',
    '3주택 이상은 20%p를 더하고 키에는 3cm를 더합니다.',
    '접미사는 앞말에 뜻을 더합니다.',
    '이번 분기 목표를 더하면 열 개입니다.',
    '실행을 한 번 더하면 결과가 바뀝니다.',
    '물에 열을 더하면 끓습니다.',
    '회귀 테스트를 추가하고 사내 위키 저장소를 추가할지 정해 주십시오.',
  ]) {
    assert.ok(!checkText(text, rules).some(v => v.rule === 'literal-verb'), text);
  }
});

test('영어를 낱말 단위로 옮긴 `반랙`, `응답 모양`, `바깥 접속`은 막고 `코드 밖에서`, `어떤 모양으로`, run을 옮긴 `돌다`, test를 옮긴 `시험`은 경고로 알린다', () => {
  /* 사용자는 Claude가 `반랙`과 `코드 밖에서 만든`을 쓴 답변을 보았다고 알려 왔습니다. 아래 문장은 같은 말을 넣어 새로 만든 문장입니다. `응답 모양`은 이 도구를 설치한 세션의 답변에서 여러 번 나왔습니다. */
  for (const target of ['chat', 'doc']) {
    for (const text of ['반랙 하나에 서버 네 대를 넣었습니다.', '공개 sample key로 응답 모양을 확인했습니다.', '바깥 접속을 켜고 다시 확인했습니다.']) {
      assert.ok(blockingViolations(checkText(text, rules, target)).some(v => v.rule === 'calque'), `${target}: ${text}`);
    }
  }
  const found = checkText('코드 밖에서 만든 보안 그룹을 어떤 모양으로 정리할지 정해야 합니다.', rules, 'chat');
  assert.deepEqual(found.filter(v => v.rule === 'translationese').map(v => v.severity), ['warning', 'warning']);
  assert.equal(blockingViolations(found).length, 0);
  /* 이 도구를 설치한 세션의 답변에는 run을 옮긴 `돌다`와 test를 옮긴 `시험`도 여러 번 나왔습니다. */
  for (const text of ['PR #25의 check가 돌고 있습니다.', '지금 prod 배포가 돕니다.', '문서만 바뀌어 deploy는 돌지 않습니다.', '시험용 APK를 올렸습니다.']) {
    const warned = checkText(text, rules, 'chat');
    assert.ok(warned.some(v => v.rule === 'translationese' && v.severity === 'warning'), text);
    assert.equal(blockingViolations(warned).length, 0, text);
  }
  for (const text of [
    'half-rack 하나에 서버 네 대를 넣었습니다.',
    '코드가 아니라 사용자가 직접 만든 보안 그룹을 어떤 순서로 정리할지 정해야 합니다.',
    '공개 sample key로 응답 형식을 확인했습니다.',
    '함수 밖에서 선언한 변수는 모듈이 처음 읽힐 때 만들어집니다.',
    '버튼을 둥근 모양으로 바꿨습니다.',
    '빌드와 테스트를 돌려 확인합니다.',
    'check가 실행 중이고 deploy는 실행되지 않습니다.',
    '테스트용 APK와 외부 접속 주소를 올렸습니다.',
  ]) {
    assert.ok(!checkText(text, rules, 'chat').some(v => v.rule === 'calque' || v.rule === 'translationese'), text);
  }
});

test('효과, 성능, 비용 같은 지표를 `재다`로 쓴 문장은 경고로 알리고 도구로 재는 길이와 시간, `재검토`나 `더하기`처럼 글자만 겹치는 낱말은 알리지 않는다', () => {
  /* 사용자는 Claude가 지표를 `재다`로 쓴 답변을 보았다고 알려 왔습니다. 아래 문장은 같은 꼴로 새로 만든 문장입니다. */
  for (const text of ['캐시를 켠 효과는 재지 않았습니다.', '이번 배포의 성능을 잴 방법이 없습니다.', '트래픽은 다음 주에 재 보겠습니다.']) {
    const found = checkText(text, rules, 'chat');
    assert.ok(found.some(v => v.rule === 'literal-verb' && v.severity === 'warning'), text);
    assert.equal(blockingViolations(found).length, 0, text);
  }
  for (const text of ['빌드 시간을 쟀습니다.', '글자 폭을 재서 맞췄습니다.', '캐시를 켠 효과는 측정하지 않았습니다.', '비용을 재검토했습니다.', '재고를 확인했습니다.', '이 저장소는 더하기 기능을 제공합니다.', '테스트는 더할 나위 없이 잘 짜였습니다.']) {
    assert.ok(!checkText(text, rules, 'chat').some(v => v.rule === 'literal-verb'), text);
  }
});

test('기본 규칙의 `literal-verbs`에는 `>`가 든 항목이 없다', () => {
  /* 0.3.5까지의 검사기는 `literal-verbs`의 `목적어>동사` 항목을 `|`로 나눈 낱말 목록으로 읽습니다. 그러면 새 규칙 문서만 받은 프로젝트에서 `설정`, `성능` 같은 낱말에도 경고가 나옵니다. 그래서 이런 항목은 예전 검사기가 읽지 않는 `object-verbs`에 둡니다. */
  assert.ok(rules.objectVerbs.size > 0);
  assert.ok([...rules.literalVerbs.keys()].every(key => !key.includes('>')));
});

test('`object-verbs` 항목은 적어 둔 낱말이 목적어일 때만 잡는다', () => {
  const own = parseRuleBlock('advisory-rules: literal-verb\nobject-verbs: 저장소|테스트>더하|더했=추가합니다');
  assert.ok(checkText('저장소를 하나 더했습니다.', own).some(v => v.rule === 'literal-verb'));
  assert.ok(!checkText('통합테스트를 더하고 배포합니다.', own).some(v => v.rule === 'literal-verb'), '앞에 한글이 붙은 목적어는 다른 낱말로 보고 잡지 않습니다');
  assert.ok(!checkText('파일을 더했습니다.', own).some(v => v.rule === 'literal-verb'), '적어 두지 않은 목적어는 잡지 않습니다');
  assert.ok(!checkText('저장소를 더했습니다.', parseRuleBlock('object-verbs: 저장소>')).some(v => v.rule === 'literal-verb'), '동사를 비운 항목은 잡지 않습니다');
});

test('`calques`에 적은 말 앞에 한글이 붙어 있거나 규칙에 값이 없으면 막지 않는다', () => {
  const own = parseRuleBlock('calques: 비목표=하지 않을 일');
  assert.ok(checkText('4절 비목표를 다시 읽었습니다.', own).some(v => v.rule === 'calque'));
  assert.ok(!checkText('준비목표를 다시 정했습니다.', own).some(v => v.rule === 'calque'), '비목표 앞에 한글이 붙은 준비목표는 다른 낱말입니다');
  assert.ok(!checkText('비멱등 요청입니다.', parseRuleBlock('calques:')).some(v => v.rule === 'calque'), '값을 비운 규칙에서는 잡으면 안 됩니다');
  assert.ok(!checkText('비멱등 요청입니다.', parseRuleBlock('register: 합니다체')).some(v => v.rule === 'calque'), '키가 없는 예전 규칙에서는 잡으면 안 됩니다');
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
  assert.deepEqual(summary.baseline, { answers: 2, skill: 0, rewritten: 0, errors: 2, register: 1, emoji: 1, middot: 1, attribution: 1, chars: [...rows[0].answers[0].text].length + [...rows[1].answers[0].text].length, costUsd: 0.1, seconds: 22,
    firstAnswers: 2, firstCostUsd: 0.1, repeatAnswers: 0, repeatCostUsd: 0 });
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
  assert.doesNotMatch(table, /처음 보낸 요청|다시 보냈을 때/, '같은 요청을 다시 보낸 기록이 없으면 비용을 나누지 않습니다');
  assert.match(table, /^\| 답변 하나를 받는 데 걸린 평균 시간 \| 11\.0초 \| 16\.0초 \|$/m);
});

test('같은 요청을 다시 보낸 결과가 있으면 처음 보낸 요청과 다시 보낸 요청의 비용을 나눠 표에 싣는다', () => {
  /* 같은 요청을 다시 보내면 캐시에 저장한 입력을 읽으므로 비용이 줄어야 합니다. 평가 도중 Claude Code의 시스템 프롬프트가 바뀌면 캐시를 쓰지 못해 비용이 줄지 않습니다. */
  const rows = [
    { profile: 'baseline', run: 1, skills: [], costUsd: 0.04, seconds: 10, answers: [{ id: 'a', text: '확인했습니다.' }] },
    { profile: 'baseline', run: 2, skills: [], costUsd: 0.01, seconds: 9, answers: [{ id: 'a', text: '확인했습니다.' }] },
    { profile: 'installed', run: 1, skills: ['korean-rewrite'], costUsd: 0.12, seconds: 14, answers: [{ id: 'a', text: '확인했습니다.' }] },
    { profile: 'installed', run: 2, skills: ['korean-rewrite'], costUsd: 0.11, seconds: 13, answers: [{ id: 'a', text: '확인했습니다.' }] },
  ];
  const table = formatSummary(summarize(rows, rules));
  assert.match(table, /^\| 처음 보낸 요청에서 답변 하나에 든 평균 비용 \| 0\.040달러 \| 0\.120달러 \|$/m);
  assert.match(table, /^\| 같은 요청을 다시 보냈을 때 답변 하나에 든 평균 비용 \| 0\.010달러 \| 0\.110달러 \|$/m);
  assert.doesNotMatch(table, /^\| 답변 하나에 든 평균 비용 \|/m, '비용을 나눠 실었으면 합친 평균은 싣지 않습니다');
  /* 같은 요청을 다시 보낸 결과가 한 프로필에만 있으면 다른 프로필의 칸에는 `-` 기호를 씁니다. */
  const partial = formatSummary(summarize(rows.slice(0, 3), rules));
  assert.match(partial, /^\| 같은 요청을 다시 보냈을 때 답변 하나에 든 평균 비용 \| 0\.010달러 \| - \|$/m);
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

test('skill에는 사용자가 알려 온 영어식 표현을 고치라는 지시가 들어 있다', () => {
  /* 사용자는 Claude가 항목을 새로 넣는 일을 `더하다`로, 지표를 구하는 일을 `재다`로 쓴 답변을 보았다고 알려 왔습니다. `반랙`, `코드 밖에서 만든`, 항목 이름에 할 일을 몰아넣고 콜론 뒤에 누가 하는지만 쓴 목록도 보았다고 알려 왔습니다. 검사기는 이 가운데 일부만 잡으므로 지시가 빠지면 안 됩니다. */
  const skill = readFileSync(new URL('../skill/korean-rewrite/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /영어 `add`, `measure`를 옮긴 `더하다`, `재다`/);
  assert.match(skill, /항목을 새로 넣는 일은 `추가하다`로 쓰고/);
  assert.match(skill, /지표를 구하는 일은 `측정하다`로 씁니다/);
  assert.match(skill, /`half-rack`을 `반랙`으로/);
  assert.match(skill, /영어 전치사구와 비유를 낱말 그대로 옮긴 말/);
  assert.match(skill, /항목 이름에 할 일을 몰아넣고 콜론 뒤에 누가 하는지만 쓴 목록/);
});

test('skill에는 흔한 한자어 동사는 그대로 쓰고 프로젝트 지침에 든 고칠 표현은 따라 쓰지 말라는 지시가 들어 있다', () => {
  /* 한때 skill의 한자어 항목 예시는 `호출`, `제거`까지 고유어로 바꾼 문장이었습니다. 그 무렵 이 도구를 설치한 세션에서 Claude는 `더하다`, `재다`를 자주 썼습니다. 이 예시가 원인인지는 확인하지 못했습니다. */
  const skill = readFileSync(new URL('../skill/korean-rewrite/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /개발 문서에서 흔히 쓰는 한자어 동사는 그대로 씁니다/);
  assert.doesNotMatch(skill, /같은 함수를 부르던 코드를 지워/);
  /* CLAUDE.md에 `버그를 고치면 회귀 테스트를 더합니다.`를 적어 둔 프로젝트에서 Claude는 같은 내용의 규칙을 쓸 때 `회귀 테스트를 더합니다`를 따라 썼습니다. */
  assert.match(skill, /프로젝트 지침, 기존 문서, 앞선 답변에 아래 고칠 표현이 있어도 표현을 맞추려고 따라 쓰지 않습니다/);
});

test('작성 지침과 skill에는 독자에게 필요한 내용만 고르고 공개하는 글에 내부 정보와 개인 정보를 넣지 말라는 지시가 들어 있다', () => {
  /* 이 도구를 설치한 프로젝트에서도 Claude는 개인정보 처리방침에 사이트 주인의 실명과 개발 서버 주소를 넣었습니다. 검사기는 이런 내용을 잡지 못하므로 지시가 빠지면 안 됩니다. */
  const style = readFileSync(new URL('../output-styles/korean-style.md', import.meta.url), 'utf8');
  const skill = readFileSync(new URL('../skill/korean-rewrite/SKILL.md', import.meta.url), 'utf8');
  assert.match(style, /누가 읽는지 정하고/);
  assert.match(style, /공개하는 글에 넣지 않습니다/);
  assert.match(skill, /^## 내용 고르기$/m);
  assert.match(skill, /공개하는 글에는 내부 정보와 개인 정보를 넣지 않습니다/);
  assert.ok(skill.indexOf('## 내용 고르기') < skill.indexOf('## 쓰는 순서'), '내용을 고른 뒤에 문장을 씁니다');
});
