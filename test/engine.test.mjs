/* 검사 엔진 테스트입니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadRules, parseRuleBlock, RULE_FENCE, REGISTER_BANNED_ENDINGS } from '../scripts/lib/rules.mjs';
import { checkText, checkToolCall, formatViolations, toolFieldTexts } from '../scripts/lib/check.mjs';
import { koreanCommentsOf, commentSyntaxOf, onlyComments } from '../scripts/lib/comments.mjs';
import { sentencesOf, unitsOf, wordCount, onlyFenced, stripCode } from '../scripts/lib/text.mjs';
import { globToRegExp, targetForPath } from '../scripts/lib/targets.mjs';

const rulesOf = (lines) => parseRuleBlock(lines.join('\n'));
const names = (violations) => violations.map((v) => v.rule);

/* ---------------------------------------------------------------------------  회귀 테스트입니다. 실제로 있었던 결함을 재현합니다. */

test('회귀: 규칙 문서를 못 읽으면 문자 규칙이 남는다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const dir = mkdtempSync(join(tmpdir(), 'korean-style-'));
  const missing = loadRules(join(dir, '없는파일.md'));
  assert.equal(missing.source, null, '못 읽었다는 사실이 드러나야 합니다');
  assert.ok(missing.reason.length > 0, '왜 못 읽었는지 적혀야 합니다');
  assert.ok(missing.bannedChar.length > 0, '문자 규칙은 남아야 합니다');
  const found = checkText('이것은 — 저것입니다. 항목 A·B 이며 완료했습니다 ✅', missing, 'chat');
  assert.ok(found.length >= 3, `문자 위반 셋이 걸려야 하는데 ${found.length}건입니다`);
  assert.ok(formatViolations(found, missing).includes('경고'), '보고에 경고가 있어야 합니다');
});

test('회귀: 규칙 블록이 없는 문서를 읽어도 문자 규칙이 남는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'korean-style-'));
  const path = join(dir, 'rules.md');
  writeFileSync(path, '# 규칙\n\n블록이 없습니다.\n', 'utf-8');
  const r = loadRules(path);
  assert.equal(r.source, null);
  assert.ok(r.bannedChar.length > 0);
});

test('회귀: 이중피동은 활용형까지 걸린다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const r = rulesOf(['double-passive: 보여=보이, 되어=되']);
  for (const bad of ['보여지다', '보여진 값', '보여져서', '보여졌다', '보여집니다', '보여짐', '보여질']) {
    assert.ok(checkText(`결과가 화면에 ${bad}.`, r, 'doc').length > 0, `${bad}는 걸려야 합니다`);
  }
  /* 어간 뒤에 `지다`의 활용형이 오지 않으면 정상 한국어입니다. */
  for (const good of ['보여 주십시오', '보여 줍니다', '되어 있습니다', '되어야 합니다']) {
    assert.equal(checkText(`결과를 ${good}.`, r, 'doc').length, 0, `${good}는 통과해야 합니다`);
  }
});

test('회귀: 백틱으로 감싼 항목 사이의 쉼표는 절을 잇는 쉼표로 세지 않는다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const r = rulesOf(['max-comma-per-sentence: 2', 'enumeration-word-max: 3']);
  const quoted = '`~적`은 `인`, `으로`, `이다`, `성` 가운데 하나가 따라옵니다.';
  assert.equal(checkText(quoted, r, 'doc').length, 0, '백틱 나열은 통과해야 합니다');
  const clauses = '오늘 배포를 마쳤고, 남은 것은 보고 하나이며, 확인이 필요하고, 일정은 내일입니다.';
  assert.deepEqual(names(checkText(clauses, r, 'doc')), ['comma-per-sentence'], '절을 잇는 쉼표는 걸려야 합니다');
});

test('회귀: 나열 항목의 어절 상한은 규칙 문서의 값을 따른다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const three = '상태 넷을 따라갑니다. 평문, 따옴표 안, 한 줄 주석, 여러 줄 주석입니다.';
  const tight = rulesOf(['max-comma-per-sentence: 2', 'enumeration-word-max: 2']);
  const loose = rulesOf(['max-comma-per-sentence: 2', 'enumeration-word-max: 3']);
  assert.ok(checkText(three, tight, 'doc').length > 0, '상한 2에서는 걸립니다');
  assert.equal(checkText(three, loose, 'doc').length, 0, '상한 3에서는 통과합니다');
});

test('회귀: 명령형과 ~해 주십시오 같은 요청형을 구분한다', () => {
  /* `~해 주십시오`는 `주다`가 붙은 요청이고 한국어에서 표준적인 존대 표현입니다. */
  const r = rulesOf(['imperative-endings: 하십시오, 하시오, 해라', 'imperative-exempt: 안녕하세요']);
  assert.deepEqual(names(checkText('결과를 확인하십시오.', r, 'chat')), ['imperative-to-human']);
  assert.equal(checkText('값을 입력해 주십시오.', r, 'chat').length, 0);
  /* 문서 안의 명령형은 나중에 읽을 agent에게 주는 지시이므로 허용합니다. */
  assert.equal(checkText('작업 전 이 절을 참조하십시오.', r, 'doc').length, 0);
});

test('회귀: 같은 어미를 어투 위반과 명령형으로 두 번 보고하지 않는다', () => {
  /* 다나까체에서 `확인하세요`는 어투도 틀리고 명령형이기도 합니다. */
  const r = rulesOf(['register: 다나까체', 'imperative-endings: 하세요, 하십시오']);
  const got = names(checkText('값을 확인하세요.', r, 'chat'));
  assert.equal(got.length, 1, `한 건이어야 하는데 ${JSON.stringify(got)}입니다`);
  assert.equal(got[0], 'wrong-register');
});

test('어투를 고르면 금지 어미가 따라 바뀐다', () => {
  const formal = rulesOf(['register: 다나까체']);
  const casual = rulesOf(['register: 해요체']);
  const mixed = rulesOf(['register: 혼용']);

  assert.ok(checkText('확인했어요.', formal, 'chat').length > 0, '다나까체에서 해요체는 걸립니다');
  assert.equal(checkText('확인했습니다.', formal, 'chat').length, 0);

  assert.ok(checkText('확인했습니다.', casual, 'chat').length > 0, '해요체에서 다나까체는 걸립니다');
  assert.equal(checkText('확인했어요.', casual, 'chat').length, 0);

  assert.equal(checkText('확인했습니다.', mixed, 'chat').length, 0, '혼용은 둘 다 허용합니다');
  assert.equal(checkText('확인했어요.', mixed, 'chat').length, 0);
});

test('해요체에서 `아니다`를 다나까체로 보지 않는다', () => {
  /* `아니다`는 `~니다`로 끝나지만 기본형입니다. */
  const r = rulesOf(['register: 해요체', 'imperative-exempt: 아니다']);
  assert.equal(checkText('그것은 사실이 아니다', r, 'doc').length, 0);
  assert.ok(checkText('그것은 사실입니다', r, 'doc').length > 0);
});

test('알 수 없는 어투 이름은 어미를 금지하지 않는다', () => {
  /* 알 수 없는 이름 때문에 검사기가 멈추면 그때부터 어떤 규칙도 적용되지 않습니다. */
  const r = rulesOf(['register: 알수없는어투']);
  assert.equal(r.bannedRegisterEndings.length, 0);
  assert.ok(Object.keys(REGISTER_BANNED_ENDINGS).length >= 3);
});

test('소스 파일은 주석만 검사한다', () => {
  /* 코드까지 검사하던 것이 이 도구의 가장 큰 오검출 원인이었습니다. */
  const r = rulesOf(['register: 다나까체', 'max-comma-per-sentence: 2', 'loanword-spelling: 워크플로우=워크플로']);
  const source = [
    "const CASES = ['워크플로우', '확인했어요', '당신', '보여집니다', '항목'];",
    '// 이 주석의 워크플로우는 걸려야 합니다.',
  ].join('\n');
  const got = names(checkText(source, r, 'comment', { path: 'a.mjs' }));
  assert.deepEqual(got, ['loanword-spelling'], `주석 하나만 걸려야 하는데 ${JSON.stringify(got)}입니다`);
});

test('경로가 없으면 주석을 뽑지 못하므로 검사하지 않는다', () => {
  const r = rulesOf(['loanword-spelling: 워크플로우=워크플로']);
  assert.equal(checkText('// 워크플로우', r, 'comment').length, 0);
});

test('모르는 확장자는 산문으로 읽지 않는다', () => {
  assert.equal(commentSyntaxOf('a.unknown'), null);
  assert.equal(koreanCommentsOf('한국어 산문입니다.', 'a.unknown').trim(), '');
});

test('문자열 안의 빗금 둘은 주석의 시작이 아니다', () => {
  const src = 'const u = "https://example.com/워크플로우";\n';
  assert.equal(koreanCommentsOf(src, 'a.mjs').trim(), '', '문자열은 주석이 아닙니다');
});

test('파이썬 삼중 따옴표 문자열은 주석으로 본다', () => {
  const src = '"""\n확인했어요.\n"""\nx = 1\n';
  assert.ok(koreanCommentsOf(src, 'a.py').includes('확인했어요'));
});

test('닫히지 않은 따옴표가 있어도 그 뒤의 주석을 뽑는다', () => {
  /* 따옴표가 파일 끝까지 이어진다고 보면 그 아래 주석을 모두 검사하지 못합니다. */
  const src = 'const bad = "닫히지 않음\n// 이 주석은 보여야 합니다.\n';
  assert.ok(koreanCommentsOf(src, 'a.mjs').includes('이 주석은 보여야 합니다'));
});

test('주석 표시는 어절로 세지 않는다', () => {
  const extracted = koreanCommentsOf('// 확인했습니다 그리고 정리했습니다\n', 'a.mjs');
  assert.ok(!extracted.includes('//'), '빗금 둘이 남으면 어절로 세어집니다');
  assert.ok(extracted.includes('확인했습니다'));
});

test('줄 번호가 유지된다', () => {
  const src = ['const a = 1;', 'const b = 2;', '// 워크플로우를 확인합니다.'].join('\n');
  const r = rulesOf(['loanword-spelling: 워크플로우=워크플로']);
  const v = checkText(src, r, 'comment', { path: 'a.mjs' });
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 3, '주석이 있는 줄을 가리켜야 합니다');
});

test('onlyComments는 길이를 바꾸지 않는다', () => {
  const src = 'const a = 1; // 확인\nconst b = 2;\n';
  assert.equal(onlyComments(src, commentSyntaxOf('a.mjs')).length, src.length);
});

/* ---------------------------------------------------------------------------  fence  --------------------------------------------------------------------------- */

test('fence 안에는 낱말 규칙만 적용하고 문장 규칙은 적용하지 않는다', () => {
  const r = rulesOf([
    'loanword-spelling: 워크플로우=워크플로',
    'max-comma-per-sentence: 2',
    'conjunctive-adverbs: 그러나',
  ]);
  const word = '아래를 확인합니다.\n```\n워크플로우 확인\n```';
  assert.deepEqual(names(checkText(word, r, 'doc')), ['loanword-spelling']);
  const command = '아래를 실행합니다.\n```\nterragrunt force-unlock 1234\n```';
  assert.equal(checkText(command, r, 'doc').length, 0);
});

test('규칙 블록은 fence 재검사에서 빠진다', () => {
  /* 규칙 블록에는 금지할 낱말이 그대로 적혀 있습니다. */
  const r = rulesOf(['loanword-spelling: 워크플로우=워크플로']);
  const doc = ['문서입니다.', '```' + RULE_FENCE, 'loanword-spelling: 워크플로우=워크플로', '```'].join('\n');
  assert.equal(checkText(doc, r, 'doc').length, 0);
});

test('onlyFenced는 fence 안쪽만 남기고 fence 표시와 바깥은 공백으로 덮는다', () => {
  const doc = '밖입니다.\n```\n안입니다.\n```\n';
  const inner = onlyFenced(doc, []);
  assert.ok(inner.includes('안입니다'));
  assert.ok(!inner.includes('밖입니다'));
  assert.ok(!inner.includes('```'));
  assert.equal(inner.length, doc.length);
});

test('stripCode는 길이를 바꾸지 않는다', () => {
  const doc = '앞 `코드` 뒤\n```\n안\n```\n';
  assert.equal(stripCode(doc).length, doc.length);
});

test('줄바꿈으로 나뉜 문장을 한 문장으로 잇는다', () => {
  /* 줄마다 따로 판정하면 영어 낱말 여섯 개가 든 한 문장이 여러 줄로 나뉘어 줄마다 통과합니다. */
  const wrapped = '이 문장은 첫 줄에서 시작해서\n다음 줄로 이어집니다.';
  const got = sentencesOf(wrapped);
  assert.equal(got.length, 1, `한 문장이어야 하는데 ${got.length}개입니다`);
});

test('표의 한 줄은 칸 경계에서 자른다', () => {
  const table = '| 첫 칸입니다. | 둘째 칸입니다. |';
  assert.ok(sentencesOf(table).length >= 2);
});

test('제목은 문장이 아니다', () => {
  assert.equal(sentencesOf('# 제목입니다').length, 0);
});

test('목록 항목은 이어지는 줄까지 한 단위로 묶는다', () => {
  const list = ['- **첫째입니다.** 설명이', '  이어집니다.', '- **둘째입니다.** 설명입니다.'].join('\n');
  const units = unitsOf(list);
  assert.equal(units.length, 2, `항목 둘이어야 하는데 ${units.length}개입니다`);
});

test('어절은 공백으로 센다', () => {
  assert.equal(wordCount('한 줄 주석'), 3);
  assert.equal(wordCount('   '), 0);
});

test('도구 입력의 산문을 필드 이름으로 찾는다', () => {
  /* 규칙을 전체 경로로 쓰면 harness가 입력을 한 단계 더 감싸는 순간 아무것도 잡지 못하면서도 강제되는 것처럼 보입니다. */
  const r = rulesOf(['chat-tool-fields: AskUserQuestion.question, AskUserQuestion.label', 'register: 다나까체']);
  const input = { questions: [{ question: '확인했어요?', options: [{ label: '당신 선택' }, { label: '괜찮습니다' }] }] };
  const found = toolFieldTexts('AskUserQuestion', input, r);
  assert.equal(found.length, 3, `필드 셋이어야 하는데 ${found.length}개입니다`);
  const problems = checkToolCall('AskUserQuestion', input, r);
  assert.ok(problems.length >= 1);
  assert.ok(
    problems.every((p) => typeof p.where === 'string' && p.where.length > 0),
    '어느 필드인지 말해야 합니다',
  );
});

test('필드마다 따로 본다', () => {
  /* 한국어 질문과 영어 선택지를 합쳐서 검사하면 통과하고 따로 검사하면 걸립니다. */
  const r = rulesOf([
    'chat-tool-fields: AskUserQuestion.question, AskUserQuestion.label',
    'korean-required-min-chars: 20',
  ]);
  const input = {
    questions: [{ question: '어느 쪽으로 하시겠습니까?', options: [{ label: 'Deploy to production immediately now' }] }],
  };
  assert.ok(checkToolCall('AskUserQuestion', input, r).length > 0);
});

test('등록되지 않은 도구는 보지 않는다', () => {
  const r = rulesOf(['chat-tool-fields: AskUserQuestion.question']);
  assert.equal(toolFieldTexts('Bash', { command: '확인했어요' }, r).length, 0);
});

test('회귀: 자모가 분리된(NFD) 한글도 완성형과 똑같이 검사한다', () => {
  /* 실제로 있었던 결함을 재현합니다. */
  const r = rulesOf([
    'double-passive: 보여=보이',
    'loanword-spelling: 워크플로우=워크플로, 디렉토리=디렉터리',
    'register: 다나까체',
  ]);
  const sentence = '이것은 보여집니다. 워크플로우와 디렉토리를 확인합니다.';

  const composed = checkText(sentence.normalize('NFC'), r, 'doc');
  const decomposed = checkText(sentence.normalize('NFD'), r, 'doc');

  assert.ok(composed.length >= 3, `완성형이 셋 이상이어야 합니다: ${names(composed)}`);
  assert.deepEqual(names(decomposed), names(composed), '풀어쓴 글이 다르게 판정되었습니다');
});

test('회귀: 자모가 분리된(NFD) 한글을 한국어가 없는 글로 판정하지 않는다', () => {
  const r = rulesOf(['korean-required-min-chars: 20', 'register: 다나까체']);
  const decomposed = '이 문장은 한국어로 쓰였고 충분히 깁니다.'.normalize('NFD');
  assert.equal(names(checkText(decomposed, r, 'chat')).includes('korean-required'), false);
});

test('subagent 프롬프트의 번역투를 잡는다', () => {
  /* output-style은 subagent에 적용되지 않으므로 프롬프트만이라도 여기서 검사합니다. */
  const r = rulesOf([
    'agent-tool-fields: Task.prompt',
    'translationese-patterns: 에 의하여=~로',
    'double-passive: 읽혀=읽히',
    'register: 다나까체',
  ]);
  const input = { prompt: '이 파일은 검사기에 의하여 읽혀집니다. 결과를 보고하십시오.', subagent_type: 'explorer' };
  const problems = checkToolCall('Task', input, r, 'doc');
  assert.ok(problems.length >= 1, '번역투와 이중피동을 잡아야 합니다');
  assert.ok(problems.every((p) => typeof p.where === 'string' && p.where.length > 0));
});

test('영어로 쓴 subagent 프롬프트는 거부하지 않는다', () => {
  /* 이 케이스가 더 중요합니다. */
  const r = rulesOf(['agent-tool-fields: Task.prompt', 'korean-required-min-chars: 20', 'register: 다나까체']);
  const input = { prompt: 'Read scripts/lib/text.mjs and report the sentence splitting contract in detail.' };
  assert.equal(checkToolCall('Task', input, r, 'doc').length, 0);
});

test('chat-tool-fields와 agent-tool-fields가 서로 섞이지 않는다', () => {
  const r = rulesOf(['chat-tool-fields: AskUserQuestion.question', 'agent-tool-fields: Task.prompt']);
  assert.equal(toolFieldTexts('Task', { prompt: '확인했습니다' }, r, 'chatToolFields').length, 0);
  assert.equal(toolFieldTexts('AskUserQuestion', { question: '확인했습니까' }, r, 'agentToolFields').length, 0);
  assert.equal(toolFieldTexts('Task', { prompt: '확인했습니다' }, r, 'agentToolFields').length, 1);
});

test('glob의 **는 경로 조각 0개와도 일치한다', () => {
  assert.ok(globToRegExp('docs/**/*.md').test('docs/a.md'));
  assert.ok(globToRegExp('docs/**/*.md').test('docs/x/y/a.md'));
  assert.ok(!globToRegExp('docs/*.md').test('docs/x/a.md'));
});

test('skip-globs에 든 경로는 다른 판정보다 먼저 건너뛴다', () => {
  const r = rulesOf(['skip-globs: docs/archive.md']);
  assert.equal(targetForPath('docs/archive.md', r), null);
  assert.equal(targetForPath('docs/other.md', r), 'doc');
  assert.equal(targetForPath('src/a.ts', r), 'comment');
  assert.equal(targetForPath('a.png', r), null);
});

test('두 번 파싱해도 목록 항목이 늘어나지 않는다', () => {
  /* 기본값을 참조로 복사하면 같은 배열에 다시 밀어 넣어 위반 하나가 두 번 보고됩니다. */
  const block = 'banned-address: 당신\nconjunctive-adverbs: 그러나';
  const a = parseRuleBlock(block);
  const b = parseRuleBlock(block);
  assert.equal(a.bannedAddress.length, b.bannedAddress.length);
  assert.equal(a.conjunctiveAdverbs.length, 1);
});

test('주석 줄과 빈 줄은 규칙이 아니다', () => {
  const r = parseRuleBlock('# banned-address: 주석입니다\n\nbanned-address: 당신\n');
  assert.deepEqual(r.bannedAddress, ['당신']);
});

test('오른쪽이 빈 매핑은 교정안을 만들어 내지 않는다', () => {
  const r = rulesOf(['translationese-patterns: 를 통해']);
  assert.equal(r.translationesePatterns.get('를 통해'), '');
  const v = checkText('로그를 통해 확인했습니다.', r, 'doc');
  assert.equal(v.length, 1);
  assert.ok(v[0].detail.includes('문맥에 맞으면 유지'), '대안을 지어내지 않아야 합니다');
});

test('숫자 0은 규칙을 끈다', () => {
  const off = rulesOf(['max-comma-per-sentence: 0']);
  const many = '하나를 했고, 둘을 했고, 셋을 했고, 넷을 했습니다.';
  assert.equal(checkText(many, off, 'doc').filter((v) => v.rule === 'comma-per-sentence').length, 0);
});

test('알 수 없는 검사 종류면 예외를 던진다', () => {
  assert.throws(() => checkText('확인했습니다.', rulesOf([]), '없는종류'));
});

test('빈 텍스트는 통과한다', () => {
  const r = rulesOf(['register: 다나까체']);
  assert.equal(checkText('', r, 'chat').length, 0);
  assert.equal(checkText('   \n  ', r, 'chat').length, 0);
});
