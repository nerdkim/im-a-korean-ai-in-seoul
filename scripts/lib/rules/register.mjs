/* 어투와 존대입니다. */
import { findAllEndings, HANGUL_SYLLABLE, lineOf, stripQuoted } from '../text.mjs';

/* 어투별로 대신 쓸 표현입니다. */
const REGISTER_ADVICE = {
  다나까체:
    '사람에게 요청할 때는 `~해 주시기 바랍니다`나 `~해 주십시오`를, 행위 명사 뒤에는 `~ 부탁드립니다`를 쓰십시오. 서술은 `~습니다`, 의문은 `~합니까`나 `~할까요`로 끝냅니다.',
  해요체:
    '서술과 의문을 `~해요`, `~예요`, `~할까요`로 맞추십시오. 요청은 `~해 주시면 좋겠어요`나 `~ 부탁드려요`로 씁니다.',
  혼용: '문서 하나 안에서는 서술 어투를 하나로 맞추십시오.',
};

/* 사람에게 명령하는 대신 쓸 형태입니다. */
const IMPERATIVE_ADVICE =
  '뜻은 그대로 두고 정중한 요청으로 고치십시오. 예: 확인해 주십시오.';

export const FLATTERY_HINT =
  '이 문장을 지우고 답부터 쓰십시오. 질문을 평가하는 문장은 정보를 주지 않고 읽는 사람을 평가받는 처지에 놓습니다.';

/* 어미 예외 목록입니다. */
function exemptWords(rules) {
  return rules.imperativeExempt;
}

export function registerViolations(text, rules, target, inFence = false) {
  const out = [];
  const human = target === 'chat';
  /* 아래 넷은 따옴표 안을 보지 않습니다. */
  const written = stripQuoted(text);

  /* 1) 어투. 모든 종류에 걸립니다. */
  const reported = new Set();
  for (const ending of rules.bannedRegisterEndings) {
    const hits = findAllEndings(written, ending, exemptWords(rules));
    if (hits.length === 0) continue;
    for (const hit of hits) reported.add(hit.index + hit[0].length);
    out.push({
      rule: 'wrong-register',
      detail: `${JSON.stringify(hits[0][0])}는 이 프로젝트가 쓰는 ${rules.register}가 아닙니다. ${REGISTER_ADVICE[rules.register] ?? ''}`,
      line: lineOf(text, hits[0].index),
    });
  }

  /* 2) 사람에게 내리는 명령. 사람이 직접 읽는 종류에만 걸립니다. */
  if (human) {
    for (const ending of rules.imperativeEndings) {
      const hits = findAllEndings(written, ending, exemptWords(rules)).filter(
        (hit) => !reported.has(hit.index + hit[0].length),
      );
      if (hits.length === 0) continue;
      out.push({
        rule: 'imperative-to-human',
        detail: `사람에게 명령했습니다: ${JSON.stringify(hits[0][0])}. ${IMPERATIVE_ADVICE}`,
        line: lineOf(text, hits[0].index),
      });
    }
  }

  if (human) {
    for (const word of rules.bannedAddress) {
      const idx = written.indexOf(word);
      if (idx === -1) continue;
      out.push({
        rule: 'banned-address',
        detail: `읽는 사람을 ${JSON.stringify(word)}이라고 불렀습니다. 상대가 알려 준 호칭을 쓰거나 주어를 생략하십시오. 한국어는 주어를 생략해도 문장이 어색해지지 않습니다.`,
        line: lineOf(text, idx),
      });
    }
  }

  /* 4) 칭찬으로 여는 문장입니다. 사람이 직접 읽는 종류에만 걸립니다. */
  if (human) {
    for (const opener of rules.flatteryOpeners) {
      const idx = written.indexOf(opener);
      if (idx === -1) continue;
      out.push({
        rule: 'flattery',
        detail: `${JSON.stringify(opener)}로 열었습니다. ${FLATTERY_HINT}`,
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
        detail: `한국어로 써야 하는 글인데 한글이 하나도 없습니다 (코드 밖 ${prose.length}글자). 설명이 길수록 영어로 넘어가기 쉽고 읽는 쪽은 한국어를 요청했습니다.`,
        line: 1,
      });
    }
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
