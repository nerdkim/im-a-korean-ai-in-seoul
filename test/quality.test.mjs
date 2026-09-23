import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadRules, parseRuleBlock } from '../scripts/lib/rules.mjs';
import { checkText, blockingViolations } from '../scripts/lib/check.mjs';
import { answersOf, assessAnswer } from '../scripts/eval-korean.mjs';

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
for (const text of natural) test(`문맥으로만 판단할 수 있는 표현은 경고만 하고 차단하지 않는다: ${text}`, () => {
  const findings = checkText(text, rules);
  assert.ok(findings.some(v => v.severity === 'warning'), '검토 후보는 남깁니다');
  assert.equal(blockingViolations(findings).length, 0);
});

test('실제 표기 오류와 이중피동은 계속 차단한다', () => {
  assert.ok(blockingViolations(checkText('작업이 완료됬습니다.', rules)).some(v => v.rule === 'known-typo'));
  assert.equal(blockingViolations(checkText('작업이 완료됐습니다.', rules)).length, 0);
  assert.ok(blockingViolations(checkText('결과가 보여집니다.', rules)).some(v => v.rule === 'double-passive'));
});

test('영어 기술 용어가 많아도 용어 수를 줄이라고 요구하지 않는다', () => {
  const text = 'React가 API를 호출하고 Redis를 조회하며 worker가 PostgreSQL을 쓰고 Docker로 실행합니다.';
  assert.ok(!checkText(text, rules).some(v => v.rule === 'bound-english'));
});

test('산문의 middle dot과 em-dash는 차단하고 대체 표현과 문자 인용은 허용한다', () => {
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

test('경고로 둘 규칙은 규칙 문서에서 고르며 파싱 결과끼리 섞이지 않는다', () => {
  const warn = parseRuleBlock('advisory-rules: translationese\ntranslationese-patterns: 를 통해=~해');
  const strict = parseRuleBlock('translationese-patterns: 를 통해=~해');
  assert.equal(blockingViolations(checkText('API를 통해 확인합니다.', warn)).length, 0);
  assert.equal(blockingViolations(checkText('API를 통해 확인합니다.', strict)).length, 1);
  assert.deepEqual(strict.advisoryRules, []);
});

test('실모델 평가에서 누락된 응답과 형식 위반을 통과로 보고하지 않는다', () => {
  assert.throws(() => answersOf('<answer id="a">응답</answer>', [{ id: 'a' }, { id: 'b' }]), /Missing answer/);
  assert.throws(() => answersOf('<answer id="a">첫째</answer><answer id="a">둘째</answer>', [{ id: 'a' }]), /duplicate/);
  const score = assessAnswer({ id: 'a', text: '끝났습니다.' }, { must: ['API'], maxChars: 3, sentences: 2 });
  assert.deepEqual(score.missing, ['API']);
  assert.equal(score.overLength, true);
  assert.equal(score.wrongSentenceCount, true);
  assert.equal(assessAnswer({ text: '확인했습니다.\n(1문장)' }, { must: [], maxChars: 100 }).metaComment, true);
  const modal = { must: [], mustAny: [['수 있', '가능성']], maxChars: 100 };
  assert.equal(assessAnswer({ text: '오류가 줄어듭니다.' }, modal).missing.length, 1);
  assert.equal(assessAnswer({ text: '오류가 줄어들 수 있습니다.' }, modal).missing.length, 0);
});

test('항상 읽는 생성 지침의 분량을 제한한다', () => {
  const style = readFileSync(new URL('../output-styles/korean-style.md', import.meta.url), 'utf8');
  assert.ok(Buffer.byteLength(style) <= 2600, '긴 설명은 README나 근거 문서에 둡니다');
  assert.match(style, /keep-coding-instructions: true/);
});
