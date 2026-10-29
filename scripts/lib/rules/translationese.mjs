/* 영어식 표현을 찾는 규칙입니다. */
import { lineOf } from '../text.mjs';

/* `@latin:` 규칙에서 목적어로 보는 영어 낱말입니다. */
const LATIN_WORD = "[A-Za-z][A-Za-z0-9'’]*(?:[-.][A-Za-z0-9]+)*";

/* 목적어에 붙는 조사입니다. */
const OBJECT_PARTICLE = '[을를]';

/* `@object:` 항목은 `효과는 재지 않았습니다`처럼 목적어를 `은`, `는`으로 앞에 내세운 문장도 봅니다. */
const OBJECT_OR_TOPIC_PARTICLE = '[을를은는]';

const LATIN_PREFIX = '@latin:';

/* `@object:` 항목은 목적어가 `>` 앞에 적은 낱말일 때만 뒤에 적은 동사를 잡습니다. 낱말 앞에 한글이 붙어 있으면 `목표`, `실행`처럼 다른 낱말의 일부로 보고 잡지 않습니다. */
const OBJECT_PREFIX = '@object:';

/* 목적어와 조사 사이에 넣은 괄호 설명입니다. `저장소(docs/wiki)를`처럼 씁니다. */
const PAREN_NOTE = '(?:\\s*\\([^()\\n]{0,80}\\))?';

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
  return right.length > 0 ? ` ${JSON.stringify(right)}처럼 고칠 수도 있습니다.` : '';
}

export function translationeseViolations(text, rules) {
  const out = [];

  /* 1) 영어식 구절입니다. */
  for (const [wrong, right] of rules.translationesePatterns) {
    const idx = text.indexOf(wrong);
    if (idx === -1) continue;
    out.push({
      rule: 'translationese',
      detail: `영어식 표현일 수 있습니다: ${JSON.stringify(wrong)}.${advise(right)}`,
      line: lineOf(text, idx),
    });
  }

  /* 2) 영어 동사를 직역한 동사입니다. */
  for (const [key, right] of rules.literalVerbs) {
    if (key.startsWith(OBJECT_PREFIX)) {
      const [nouns, verbs = ''] = key.slice(OBJECT_PREFIX.length).split('>');
      const objects = alternation(nouns);
      const stems = alternation(verbs);
      if (objects.length === 0 || stems.length === 0) continue;
      /* 적어 둔 낱말과 조사 뒤에 동사가 오는 문장을 찾습니다. `@latin:` 규칙처럼 조사와 동사 사이에 낱말이 두 개까지 올 수 있습니다. */
      const m = new RegExp(`(?<![가-힣])(${objects})${PAREN_NOTE}\\s*${OBJECT_OR_TOPIC_PARTICLE}\\s+(?:\\S+\\s+){0,2}(?:${stems})`, 'u').exec(text);
      if (m === null) continue;
      out.push({
        rule: 'literal-verb',
        detail: `목적어 ${JSON.stringify(m[1])} 뒤에 직역 동사를 썼습니다: ${JSON.stringify(m[0].trim().slice(0, 40))}.${advise(right)}`,
        line: lineOf(text, m.index),
      });
      continue;
    }
    if (key.startsWith(LATIN_PREFIX)) {
      const stems = alternation(key.slice(LATIN_PREFIX.length));
      if (stems.length === 0) continue;
      /* 영어 낱말과 목적격 조사 뒤에 동사가 오는 문장을 찾습니다. 조사와 동사 사이에는 낱말이 두 개까지 올 수 있습니다. 숫자 바로 뒤의 `cm`, `%p` 같은 단위는 목적어로 보지 않습니다. */
      const re = new RegExp(`(?<![0-9%A-Za-z])(${LATIN_WORD})${PAREN_NOTE}\\s*${OBJECT_PARTICLE}\\s+(?:\\S+\\s+){0,2}(?:${stems})`, 'gu');
      /* `literal-verb-exempt`에 든 영어 낱말은 건너뜁니다. */
      const exempt = new Set(rules.literalVerbExempt.map((w) => w.toLowerCase()));
      const exemptRe =
        exempt.size === 0 ? null : new RegExp(`\\b(?:${[...exempt].map(escape).join('|')})\\b`, 'iu');
      let m = null;
      for (const candidate of text.matchAll(re)) {
        if (exempt.has(candidate[1].toLowerCase())) continue;
        /* 첫 낱말과 동사 사이에 예외 낱말이 있으면 건너뜁니다. */
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
