/* 낱말 선택을 봅니다. */
import { escapeRe, lineOf, stripQuoted } from '../text.mjs';

/* 한국어로 용어를 정의하거나 풀이하는 표현입니다. */
const KOREAN_DEFINING = /(이란|란\s|뜻|가리킵니다|가리키는|말합니다|의미합니다|이라고 부르|라고 부르|풀어 쓰면|즉)/u;

export function hasGlossNear(text, index, termLength) {
  const from = Math.max(0, index - 80);
  const to = Math.min(text.length, index + termLength + 260);
  const win = text.slice(from, to);
  if (/\([^)]*[가-힣][^)]*\)/u.test(win)) return true;
  return KOREAN_DEFINING.test(win);
}

/* 왼쪽을 오른쪽으로 바꾸라고 하는 규칙들을 같은 방식으로 처리합니다. */
function substitutionViolations(text, map, rule, describe) {
  const out = [];
  for (const [wrong, right] of map) {
    const idx = text.indexOf(wrong);
    if (idx === -1) continue;
    out.push({ rule, detail: describe(wrong, right), line: lineOf(text, idx) });
  }
  return out;
}

export function vocabularyViolations(text, rules, target) {
  const out = [];
  const human = target === 'chat';

  /* 1) 외래어 표기입니다. */
  out.push(
    ...substitutionViolations(
      text,
      rules.loanwordSpelling,
      'loanword-spelling',
      (wrong, right) =>
        `프로젝트 표기: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}.`,
    ),
  );

  /* 2) 한글로 옮겨 적은 영어 낱말입니다. */
  out.push(
    ...substitutionViolations(
      text,
      rules.bannedTransliteration,
      'transliteration',
      (wrong, right) =>
        `한글 음차를 썼습니다: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}. 화면과 명령줄에 영어로 나타나는 낱말은 문장에서도 영어로 씁니다.`,
    ),
  );

  /* 3) 뜻이 대충 같은 한국어로 옮긴 기술 용어입니다. */
  if (human) {
    out.push(
      ...substitutionViolations(
        text,
        rules.bannedTranslation,
        'loose-translation',
        (wrong, right) =>
          `기술 용어를 한국어로 옮겼습니다: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}. 읽는 사람이 다시 번역해야 하는 낱말은 쓰지 않습니다.`,
      ),
    );

    /* 4) 틀리지는 않았지만 이 팀이 쓰는 표기가 아닌 것입니다. */
    out.push(
      ...substitutionViolations(
        text,
        rules.requiredSpelling,
        'required-spelling',
        (wrong, right) => `이 프로젝트가 쓰는 표기가 아닙니다: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}.`,
      ),
    );
  }

  /* 5) 낱말이 아닌 철자입니다. */
  out.push(
    ...substitutionViolations(
      stripQuoted(text),
      rules.knownTypos,
      'known-typo',
      (wrong, right) =>
        `오타 후보: ${JSON.stringify(wrong)} → ${JSON.stringify(right)}.`,
    ),
  );

  /* 6) 차별 소지가 있는 용어입니다. */
  for (const [wrong, right] of rules.inclusiveTerms) {
    const re = new RegExp(`(^|[^0-9A-Za-z_])${escapeRe(wrong)}(?![0-9A-Za-z_])`, 'iu');
    const m = re.exec(text);
    if (m === null) continue;
    out.push({
      rule: 'inclusive-term',
      detail: `팀에서 검토할 용어입니다: ${JSON.stringify(m[0].slice(m[1].length))} → ${JSON.stringify(right)}.`,
      line: lineOf(text, m.index + m[1].length),
    });
  }

  /* 7) 설명 없이 쓴 용어입니다. */
  for (const term of rules.needsGloss) {
    const re = new RegExp(`(^|[^0-9A-Za-z_-])${escapeRe(term)}([^0-9A-Za-z_-]|$)`, 'iu');
    const m = re.exec(text);
    if (m === null) continue;
    const at = m.index + m[1].length;
    if (hasGlossNear(text, at, term.length)) continue;
    out.push({
      rule: 'unexplained-term',
      detail: `설명 없이 쓴 용어입니다: ${JSON.stringify(term)}. 처음 나올 때 괄호나 한 문장으로 뜻을 설명하십시오.`,
      line: lineOf(text, at),
    });
  }

  /* 8) 한글 부정 접두사를 영어 어간에 붙인 것입니다. */
  if (rules.negationPrefixes.length > 0) {
    const cls = rules.negationPrefixes.join('');
    const re = new RegExp(`(^|[^\\uAC00-\\uD7A3])([${cls}])-?([A-Za-z])`, 'u');
    const m = re.exec(text);
    if (m !== null) {
      out.push({
        rule: 'hybrid-negation',
        detail: `한글 부정 접두사를 영어 어간에 붙였습니다: ${JSON.stringify(m[2] + m[3])}. 부정형 용어는 전부 영어로 쓰십시오. 예: non-blocking.`,
        line: lineOf(text, m.index + m[1].length),
      });
    }
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}
