/* 번역투입니다. */
import { lineOf } from '../text.mjs';

/* `@latin:` 규칙에서 목적어로 인정하는 영어 낱말입니다. */
const LATIN_WORD = "[A-Za-z][A-Za-z0-9'’]*(?:[-.][A-Za-z0-9]+)*";

/* 목적어에 붙는 조사입니다. */
const OBJECT_PARTICLE = '[을를]';

const LATIN_PREFIX = '@latin:';

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* 세로줄로 나눈 대안을 정규식 하나로 만듭니다. */
function alternation(left) {
  return left
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(escape)
    .join('|');
}

function advise(right) {
  return right.length > 0
    ? ` ${JSON.stringify(right)}도 검토할 수 있습니다. 문맥에 맞으면 유지합니다.`
    : ' 문맥에 맞으면 유지합니다.';
}

export function translationeseViolations(text, rules) {
  const out = [];

  /* 1) 번역투 구절입니다. */
  for (const [wrong, right] of rules.translationesePatterns) {
    const idx = text.indexOf(wrong);
    if (idx === -1) continue;
    out.push({
      rule: 'translationese',
      detail: `번역투 후보 표현입니다: ${JSON.stringify(wrong)}.${advise(right)}`,
      line: lineOf(text, idx),
    });
  }

  /* 2) 영어 동사를 글자대로 옮긴 동사입니다. */
  for (const [key, right] of rules.literalVerbs) {
    if (key.startsWith(LATIN_PREFIX)) {
      const stems = alternation(key.slice(LATIN_PREFIX.length));
      if (stems.length === 0) continue;
      /* 영어 낱말과 목적격 조사 뒤에 낱말을 두 개까지 건너뛰고 동사가 오는 모양입니다. */
      const re = new RegExp(`(${LATIN_WORD})\\s*${OBJECT_PARTICLE}\\s+(?:\\S+\\s+){0,2}(?:${stems})`, 'gu');
      /* 목록에 있는 영어 낱말은 건너뜁니다. */
      const exempt = new Set(rules.literalVerbExempt.map((w) => w.toLowerCase()));
      const exemptRe =
        exempt.size === 0 ? null : new RegExp(`\\b(?:${[...exempt].map(escape).join('|')})\\b`, 'iu');
      let m = null;
      for (const candidate of text.matchAll(re)) {
        if (exempt.has(candidate[1].toLowerCase())) continue;
        /* 첫 낱말 뒤부터 동사까지 사이에 예외 낱말이 있으면 건너뜁니다. */
        if (exemptRe !== null && exemptRe.test(candidate[0].slice(candidate[1].length))) continue;
        m = candidate;
        break;
      }
      if (m === null) continue;
      out.push({
        rule: 'literal-verb',
        detail: `영어 목적어 ${JSON.stringify(m[1])} 뒤에 직역 동사를 썼습니다: ${JSON.stringify(m[0].trim().slice(0, 40))}.${advise(right)}`,
        line: lineOf(text, m.index),
      });
      continue;
    }
    const forms = alternation(key);
    if (forms.length === 0) continue;
    const m = new RegExp(`(?:${forms})`, 'u').exec(text);
    if (m === null) continue;
    out.push({
      rule: 'literal-verb',
      detail: `직역 표현을 썼습니다: ${JSON.stringify(m[0])}.${advise(right)}`,
      line: lineOf(text, m.index),
    });
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
