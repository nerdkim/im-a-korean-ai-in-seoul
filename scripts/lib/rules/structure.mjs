/* 문장이 어떻게 만들어졌는지 봅니다. */
import { hangulLength, isKoreanProse, lineOf, LIST_MARK, overDensity, sentencesOf } from '../text.mjs';

/* 앞에 오면 `~적`이 접미사가 아니라 낱말의 일부가 되는 음절입니다. */
const JEOK_NOT_SUFFIX = '목지기면실흔성업축추표사호적국';

/* `~적` 접미사입니다. */
const SUFFIX_JEOK = new RegExp(`[가-힣](?<![${JEOK_NOT_SUFFIX}])적(?=인|으로|이다|입니다|성|이며|이고)`, 'gu');

/* 관형격 조사 `~의`입니다. */
const PARTICLE_UI = /[가-힣]의(?=\s)/gu;

/* 실제 명사인데 명사화 어미로 끝나는 것들입니다. */
const REAL_NOUNS_IN_M = new Set([
  '믿음', '도움', '마음', '모음', '웃음', '죽음', '꿈', '잠', '처음', '느낌',
  '얼음', '걸음', '울음', '싸움', '아픔', '기쁨', '슬픔', '즐거움', '어려움', '다름',
  '삶', '앎', '봄', '춤', '그림', '주름', '이름', '기름', '구름', '보름',
]);

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* `지다`가 활용하면서 나타나는 음절들입니다. */
const JIDA_SYLLABLES = '지진져졌집짐질';

export function structureViolations(text, rules) {
  const out = [];
  const hangul = hangulLength(text);
  const sentences = sentencesOf(text);

  for (const [stem, right] of rules.doublePassive) {
    const re = new RegExp(`${escape(stem)}(?=[${JIDA_SYLLABLES}])`, 'u');
    const m = re.exec(text);
    if (m === null) continue;
    /* 보고에는 실제로 쓴 형태를 담습니다. */
    const written = text.slice(m.index, Math.min(text.length, m.index + stem.length + 3));
    out.push({
      rule: 'double-passive',
      detail: `이중피동 후보 ${JSON.stringify(written)}입니다.${right.length > 0 ? ` 어간을 ${JSON.stringify(right)}로 고치십시오.` : ""}`,
      line: lineOf(text, m.index),
    });
  }

  if (rules.maxSentenceChars > 0) {
    for (const sentence of sentences) {
      if (!isKoreanProse(sentence.text, rules.finalEndings, rules.sentenceMinHangulRatio)) continue;
      const len = sentence.text.replace(/\s+/g, '').length;
      if (len <= rules.maxSentenceChars) continue;
      out.push({
        rule: 'sentence-too-long',
        detail: `문장 길이 ${len}자, 기준 ${rules.maxSentenceChars}자입니다.`,
        line: lineOf(text, sentence.index),
      });
    }
  }

  /* 3) 명사형 종결 밀도입니다. */
  if (rules.maxNominalizationPer1k > 0 && rules.nominalizationEndings.length > 0) {
    const alternation = rules.nominalizationEndings.map(escape).join('|');
    const re = new RegExp(`([가-힣]*(?:${alternation}))(?=[.\\s]*$)`, 'gmu');
    const hits = [];
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').pop() ?? '';
      /* 목록 항목과 표 줄과 제목은 개조식이 정상입니다. */
      if (LIST_MARK.test(line) || line.trimStart().startsWith('|') || line.trimStart().startsWith('#')) continue;
      if (REAL_NOUNS_IN_M.has(m[1])) continue;
      hits.push(m);
    }
    {
      const density = overDensity(hits.length, hangul, rules.maxNominalizationPer1k, rules);
      if (density !== null) {
        out.push({
          rule: 'nominalization',
          detail: `명사형 종결 ${hits.length}회, 1000자당 ${density.toFixed(2)}회입니다.`,
          line: lineOf(text, hits[hits.length - 1].index),
        });
      }
    }
  }

  /* 4) 지시 표현 밀도입니다. */
  if (rules.maxDemonstrativePer1k > 0 && rules.demonstratives.length > 0) {
    const hits = [];
    for (const word of rules.demonstratives) {
      /* 낱말 경계를 요구합니다. */
      const re = new RegExp(`(^|[^가-힣])${escape(word)}(?=\\s)`, 'gu');
      for (const m of text.matchAll(re)) hits.push({ index: m.index + m[1].length, word });
    }
    {
      const density = overDensity(hits.length, hangul, rules.maxDemonstrativePer1k, rules);
      if (density !== null) {
        hits.sort((a, b) => a.index - b.index);
        const worst = [...new Set(hits.map((h) => h.word))].slice(0, 5);
        out.push({
          rule: 'demonstrative-density',
          detail: `지시 표현 ${hits.length}회입니다: ${worst.join(", ")}.`,
          line: lineOf(text, hits[hits.length - 1].index),
        });
      }
    }
  }

  /* 5) `~적` 접미사 밀도입니다. */
  if (rules.maxSuffixJeokPer1k > 0) {
    const hits = [...text.matchAll(SUFFIX_JEOK)];
    {
      const density = overDensity(hits.length, hangul, rules.maxSuffixJeokPer1k, rules);
      if (density !== null) {
        out.push({
          rule: 'suffix-jeok-density',
          detail: `접미사 "~적" ${hits.length}회, 1000자당 ${density.toFixed(2)}회입니다.`,
          line: lineOf(text, hits[hits.length - 1].index),
        });
      }
    }
  }

  /* 6) 관형격 조사 `~의` 밀도입니다. */
  if (rules.maxParticleUiPer1k > 0) {
    const hits = [...text.matchAll(PARTICLE_UI)];
    {
      const density = overDensity(hits.length, hangul, rules.maxParticleUiPer1k, rules);
      if (density !== null) {
        out.push({
          rule: 'particle-ui-density',
          detail: `조사 "의" ${hits.length}회, 1000자당 ${density.toFixed(2)}회입니다.`,
          line: lineOf(text, hits[hits.length - 1].index),
        });
      }
    }
  }

  for (const quantifier of rules.pluralQuantifiers) {
    const re = new RegExp(`${escape(quantifier)}\\s+[가-힣]+들(?=[\\s.,)\\]은는이가을를에]|$)`, 'u');
    const m = re.exec(text);
    if (m === null) continue;
    out.push({
      rule: 'redundant-plural',
      detail: `수량 표현 뒤의 복수형입니다: ${JSON.stringify(m[0].trim())}`,
      line: lineOf(text, m.index),
    });
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
