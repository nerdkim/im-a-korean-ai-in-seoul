/* 어투와 존대를 검사하는 규칙입니다. */
import { findAllEndings, HANGUL_SYLLABLE, lineOf, stripQuoted } from '../text.mjs';

/* 어투별로 대신 쓸 표현입니다. */
const REGISTER_ADVICE = {
  다나까체:
    '사람에게 요청할 때는 `~해 주시기 바랍니다`나 `~해 주십시오`를, 행위 명사 뒤에는 `~ 부탁드립니다`를 쓰십시오. 서술은 `~습니다`로, 의문은 `~합니까`나 `~할까요`로 끝냅니다.',
  해요체:
    '서술과 의문을 `~해요`, `~예요`, `~할까요`로 맞추십시오. 요청은 `~해 주세요`나 `~ 부탁드려요`로 씁니다.',
  혼용: '문서 하나 안에서는 서술 어투를 하나로 맞추십시오.',
};

/* 사람에게 명령하는 대신 쓸 형태입니다. 예는 프로젝트 어투로 씁니다. */
const REQUEST_EXAMPLE = { 다나까체: '확인해 주십시오', 해요체: '확인해 주세요' };
const imperativeAdvice = (register) =>
  `뜻은 그대로 두고 정중한 요청으로 고치십시오. 예: ${REQUEST_EXAMPLE[register] ?? REQUEST_EXAMPLE.다나까체}.`;

export const FLATTERY_HINT =
  '이 문장을 지우고 답부터 쓰십시오. 질문이나 지적을 평가하는 문장은 정보를 주지 못하고 읽는 사람을 평가하는 셈이 됩니다.';

/* 어미 예외 목록입니다. */
function exemptWords(rules) {
  return rules.imperativeExempt;
}

export function registerViolations(text, rules, target, inFence = false) {
  const out = [];
  const human = target === 'chat';
  /* 아래 1)부터 4)까지는 따옴표 안을 보지 않습니다. */
  const written = stripQuoted(text);

  /* 1) 어투입니다. 모든 종류에 걸립니다. */
  const reported = new Set();
  for (const ending of rules.bannedRegisterEndings) {
    const hits = findAllEndings(written, ending, exemptWords(rules));
    if (hits.length === 0) continue;
    for (const hit of hits) reported.add(hit.index + hit[0].length);
    out.push({
      rule: 'wrong-register',
      detail: `이 프로젝트의 어투(${rules.register})와 다른 어미를 썼습니다: ${JSON.stringify(hits[0][0])}. ${REGISTER_ADVICE[rules.register] ?? ''}`,
      line: lineOf(text, hits[0].index),
    });
  }

  /* 2) 사람에게 내리는 명령입니다. 사람이 직접 읽는 종류에만 걸립니다. */
  if (human) {
    for (const ending of rules.imperativeEndings) {
      const hits = findAllEndings(written, ending, exemptWords(rules)).filter(
        (hit) => !reported.has(hit.index + hit[0].length),
      );
      if (hits.length === 0) continue;
      out.push({
        rule: 'imperative-to-human',
        detail: `사람에게 명령했습니다: ${JSON.stringify(hits[0][0])}. ${imperativeAdvice(rules.register)}`,
        line: lineOf(text, hits[0].index),
      });
    }
  }

  /* 3) 금지한 호칭입니다. 사람이 직접 읽는 종류에만 걸립니다. */
  if (human) {
    for (const word of rules.bannedAddress) {
      const idx = written.indexOf(word);
      if (idx === -1) continue;
      out.push({
        rule: 'banned-address',
        detail: `읽는 사람을 금지한 호칭으로 불렀습니다: ${JSON.stringify(word)}. 상대가 알려 준 호칭을 쓰거나 주어를 생략하십시오. 한국어는 주어를 생략해도 문장이 어색해지지 않습니다.`,
        line: lineOf(text, idx),
      });
    }
  }

  /* 4) 질문이나 지적을 칭찬하는 표현입니다. 사람이 직접 읽는 종류에만 걸립니다. */
  if (human) {
    for (const opener of rules.flatteryOpeners) {
      const idx = written.indexOf(opener);
      if (idx === -1) continue;
      out.push({
        rule: 'flattery',
        detail: `질문이나 지적을 칭찬하는 표현을 썼습니다: ${JSON.stringify(opener)}. ${FLATTERY_HINT}`,
        line: lineOf(text, idx),
      });
    }
  }

  /* 5) 한국어로 써야 할 글을 영어로 썼는지 봅니다. fence 안에서는 걸지 않습니다. */
  if (human && !inFence && rules.koreanRequiredMinChars > 0) {
    const prose = text.replace(/\s+/g, '');
    if (prose.length >= rules.koreanRequiredMinChars && !HANGUL_SYLLABLE.test(text)) {
      out.push({
        rule: 'korean-required',
        detail: `코드 밖에 쓴 글이 ${prose.length}글자나 되는데 한글이 하나도 없습니다. 설명이 길수록 영어로 넘어가기 쉽습니다. 읽는 사람이 한국어를 요청했다면 한국어로 다시 쓰십시오.`,
        line: 1,
      });
    }
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
