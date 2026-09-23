/* 쉼표입니다. */
import {
  endsWithAny,
  hangulLength,
  isKoreanProse,
  overDensity,
  lineOf,
  maskCommaAsides,
  sentencesOf,
  withoutEnumerations,
  wordCount,
} from '../text.mjs';

/* 문장을 쉼표로 나눈 구간들입니다. */
function commaSegments(sentence) {
  const out = [];
  let at = 0;
  for (const piece of sentence.split(',')) {
    out.push({ text: piece, index: at, words: wordCount(piece) });
    at += piece.length + 1;
  }
  return out;
}

function isClause(segment, rules) {
  return clauseEnding(segment, rules) !== null;
}

/* 이 구간을 끝내는 연결어미입니다. */
function clauseEnding(segment, rules) {
  if (segment.words < rules.clauseMinWords) return null;
  const byLength = [...rules.connectiveEndings].sort((a, b) => b.length - a.length);
  return byLength.find((ending) => endsWithAny(segment.text, [ending])) ?? null;
}

function looksLikeEnumeration(segments, maxWords, rules) {
  if (segments.length < 3) return false;
  const middle = segments.slice(1, -1);
  if (middle.length === 0) return false;
  /* 병렬 절 나열입니다. */
  if (middle.length >= 2) {
    const endings = middle.map((s) => clauseEnding(s, rules));
    if (endings.every((e) => e !== null && e === endings[0])) return true;
  }
  /* 절이 하나라도 있으면 나열이 아닙니다. */
  if (middle.some((s) => isClause(s, rules))) return false;
  /* 어절이 0인 구간도 나열 항목으로 셉니다. */
  return middle.every((s) => s.words <= maxWords);
}

export function punctuationViolations(text, rules) {
  const out = [];
  /* 한국어 산문 문장만 봅니다. */
  const sentences = sentencesOf(text)
    .filter((s) => isKoreanProse(s.text, rules.finalEndings, rules.sentenceMinHangulRatio))
    .map((s) => ({ ...s, masked: maskCommaAsides(s.text) }));

  /* 1) 한 문장에 든 쉼표 개수입니다. 한도는 `docs/rules.md`가 정합니다. */
  if (rules.maxCommaPerSentence > 0) {
    for (const sentence of sentences) {
      const segments = commaSegments(sentence.masked);
      const commas = segments.length - 1;
      if (commas <= rules.maxCommaPerSentence) continue;
      if (looksLikeEnumeration(segments, rules.enumerationWordMax, rules)) continue;
      out.push({
        rule: 'comma-per-sentence',
        detail: `문장 안의 쉼표 ${commas}개, 기준 ${rules.maxCommaPerSentence}개입니다.`,
        line: lineOf(text, sentence.index),
      });
    }
  }

  /* 2) 쉼표로 나눈 구간의 길이입니다. */
  if (rules.maxCommaSegmentWords > 0) {
    for (const sentence of sentences) {
      const segments = commaSegments(sentence.masked);
      if (segments.length < 2) continue;
      if (looksLikeEnumeration(segments, rules.enumerationWordMax, rules)) continue;
      /* 마지막 구간은 재지 않습니다. */
      const over = segments
        .slice(0, -1)
        .find((s) => s.words > rules.maxCommaSegmentWords && !isClause(s, rules));
      if (over === undefined) continue;
      /* 보고는 원문에서 잘라 보여 줍니다. */
      const written = sentence.text.slice(over.index, over.index + over.text.length);
      out.push({
        rule: 'comma-segment-length',
        detail: `쉼표 앞 ${over.words}어절, 기준 ${rules.maxCommaSegmentWords}어절입니다: ${JSON.stringify(written.trim().slice(0, 40))}`,
        line: lineOf(text, sentence.index + over.index),
      });
    }
  }

  /* 접속부사 뒤의 쉼표를 검토 후보로 수집합니다. */
  for (const adverb of rules.conjunctiveAdverbs) {
    /* 문장이나 줄, 목록 항목의 맨 앞이어야 합니다. */
    const re = new RegExp(`(^|[.!?]\\s+|\\n\\s*|^\\s*[-*+]\\s+)(${adverb}),`, 'gmu');
    const m = re.exec(text);
    if (m === null) continue;
    out.push({
      rule: 'comma-after-conjunctive-adverb',
      detail: `접속부사 ${JSON.stringify(adverb)} 뒤의 쉼표입니다.`,
      line: lineOf(text, m.index + m[1].length),
    });
  }

  /* 4) 연결어미 뒤 쉼표의 빈도입니다. */
  if (rules.maxConnectiveCommaPer1k > 0 && rules.connectiveEndings.length > 0) {
    const alternation = rules.connectiveEndings.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    /* 연결어미 `고`와 같은 음절로 끝나는 명사 몇 개는 뺍니다. */
    const re = new RegExp(`(?![참보사경신광창예원중]고,)[가-힣](?:${alternation}),`, 'gu');
    const hangul = hangulLength(text);
    const hits = withoutEnumerations([...text.matchAll(re)]);
    {
      const density = overDensity(hits.length, hangul, rules.maxConnectiveCommaPer1k, rules);
      if (density !== null) {
        out.push({
          rule: 'comma-after-connective',
          detail: `연결어미 뒤 쉼표 ${hits.length}회, 1000자당 ${density.toFixed(2)}회입니다.`,
          line: lineOf(text, hits[hits.length - 1].index),
        });
      }
    }
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
