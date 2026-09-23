/* 낱말을 잡는 대신 습관을 세는 규칙입니다. */
import { hangulLength, isKoreanProse, lineOf, overDensity, proseLength, sentencesOf, unitsOf } from '../text.mjs';

/* 조사나 경동사가 붙은 영어 낱말입니다. */
/* 낱말은 첫 번째 캡처 그룹에 담깁니다. */
const BOUND_ENGLISH = new RegExp(
  "\\b([A-Za-z][A-Za-z0-9'’]*(?:[-.][A-Za-z0-9]+)*)" +
    '(?:' +
    '\\s?(?:을|를|은|는|이|가|의|에서|에|으로|로|도|만|부터|까지|보다|처럼)(?=[\\s.,)\\]!?"\'\n]|$)' +
    '|(?:하|되|한|된|합|됩|했|됐|입|였)' +
    ')',
  'gu',
);

/* `한글(English)` 모양의 괄호 설명입니다. */
const PARENTHETICAL_GLOSS = /[가-힣]\s?\(([A-Za-z][A-Za-z0-9 ._-]{1,40})\)/gu;

/* 설명이 아니라 인용인 괄호입니다. */
const CITATION = /^(?:[^a-z]*|[A-Z]{1,3}-?\d+[a-z]?)$/;

/* 설명 대신 이름을 담은 괄호입니다. */
const IDENTIFIER = /_|[a-z][A-Z]|^[a-z][a-z0-9]*\.[a-z]/;

/* 굵게 표시한 강조 구간입니다. */
const BOLD = /\*\*[^*\n]+\*\*/g;

/* 대조 구문입니다. */
const CONTRAST = { en: /\brather than\b/g, ko: /아니라/g };

export function densityViolations(text, rules) {
  const out = [];
  /* 한글이 없으면 한국어 문법 규칙을 적용하지 않습니다. */
  const hasHangul = hangulLength(text) > 0;

  /* 1) 한 문장에서 조사나 경동사가 붙은 영어 낱말 수입니다. */
  if (hasHangul && rules.maxBoundEnglishPerSentence > 0) {
    for (const sentence of sentencesOf(text)) {
      if (!/[가-힣]/u.test(sentence.text)) continue;
      if (!isKoreanProse(sentence.text, rules.finalEndings, 0)) continue;
      const words = [...new Set([...sentence.text.matchAll(BOUND_ENGLISH)].map((m) => m[1].toLowerCase()))];
      if (words.length <= rules.maxBoundEnglishPerSentence) continue;
      out.push({
        rule: 'bound-english',
        detail: `한 한국어 문장에 조사나 경동사가 붙은 서로 다른 영어 낱말이 ${words.length}개입니다(한도 ${rules.maxBoundEnglishPerSentence}개): ${words
          .slice(0, 6)
          .map((w) => JSON.stringify(w))
          .join(', ')}. 문장을 나누십시오. 용어를 한국어로 옮기는 것은 답이 아닙니다.`,
        line: lineOf(text, sentence.index),
      });
    }
  }

  /* 2) 같은 영어 용어를 괄호로 다시 설명한 것입니다. */
  if (hasHangul && rules.maxRepeatedEnglishGloss > 0) {
    const seen = new Map();
    for (const m of text.matchAll(PARENTHETICAL_GLOSS)) {
      if (CITATION.test(m[1].trim())) continue;
      if (IDENTIFIER.test(m[1].trim())) continue;
      const key = m[1].trim().toLowerCase();
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count <= rules.maxRepeatedEnglishGloss) continue;
      out.push({
        rule: 'repeated-gloss',
        detail: `같은 용어를 괄호로 ${count}번 설명했습니다: ${JSON.stringify(m[1].trim())}.`,
        line: lineOf(text, m.index),
      });
    }
  }

  /* 3) 굵게 표시한 강조의 개수입니다. */
  if (rules.maxBoldPerUnit > 0) {
    for (const unit of unitsOf(text)) {
      const hits = unit.text.match(BOLD) ?? [];
      if (hits.length <= rules.maxBoldPerUnit) continue;
      out.push({
        rule: 'bold-density',
        detail: `문단 또는 항목의 강조 ${hits.length}개, 기준 ${rules.maxBoldPerUnit}개입니다.`,
        line: unit.line,
      });
    }
  }

  /* 4) 대조 구문입니다. */
  const prose = proseLength(text);
  for (const [language, re] of Object.entries(CONTRAST)) {
    const limit = rules.maxContrastPer1k[language];
    if (limit === undefined || prose === 0) continue;
    const hits = [...text.matchAll(re)];
    const density = overDensity(hits.length, prose, limit, rules);
    if (density === null) continue;
    out.push({
      rule: 'contrast-density',
      detail: `대조 표현 ${hits.length}회, 1000자당 ${density.toFixed(2)}회입니다.`,
      line: lineOf(text, hits[hits.length - 1].index),
    });
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
