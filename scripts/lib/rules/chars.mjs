/* 쓰지 않는 글자입니다. */
import { lineOf, stripCode } from '../text.mjs';

/* 글자 종류입니다. */
export const CHAR_CLASSES = {
  middot: { label: '가운뎃점 (U+00B7)', re: /·/u },
  'em-dash': { label: '줄표 (U+2014)', re: /—/u },
  'en-dash': { label: '반각 줄표 (U+2013)', re: /–/u },
  emoji: {
    label: 'emoji',
    re: new RegExp(
      '(?![\\u00A9\\u00AE\\u2122\\u2190-\\u21FF\\u2B00-\\u2BFF])[\\p{Extended_Pictographic}\\p{Regional_Indicator}]',
      'u',
    ),
  },
  hanja: { label: '한자', re: /[一-鿿㐀-䶿]/u },
  kana: { label: '일본어 가나', re: /[぀-ゟ゠-ヿ]/u },
  'fullwidth-paren': { label: '전각 괄호 (U+FF08, U+FF09)', re: /[（）]/u },
};

/* 콜론으로 감싼 Slack shortcode입니다. */
const SHORTCODE_RE = /(^|[\s(])(:[a-z0-9_+-]{2,}:)(?=[\s.,!?)\]]|$)/u;

/* 금지된 글자를 찾습니다. */
export function charViolations(text, rules) {
  const out = [];
  for (const name of rules.bannedChar) {
    const spec = CHAR_CLASSES[name];
    if (spec === undefined) continue;
    const m = spec.re.exec(text);
    if (m === null) continue;
    out.push({
      rule: 'banned-char',
      detail: `금지된 글자를 썼습니다: ${spec.label} ${JSON.stringify(m[0])}. 부호라면 쉼표, 괄호, 빗금, 하이픈 가운데 하나로 바꾸십시오. 글자 자체를 인용할 때는 백틱으로 감싸십시오.`,
      line: lineOf(text, m.index),
    });
  }
  if (rules.bannedChar.includes('emoji')) {
    const m = SHORTCODE_RE.exec(text);
    const asked = m === null ? false : rules.allowedEmojiShortcodes.includes(m[2].slice(1, -1));
    if (m !== null && !asked) {
      out.push({
        rule: 'banned-char',
        detail: `Slack emoji shortcode를 썼습니다: ${JSON.stringify(m[2])}. 반응 이름처럼 프로토콜 토큰이라면 백틱 안에 두십시오. 산문에서는 쓰지 않습니다.`,
        line: lineOf(text, m.index),
      });
    }
  }
  return out;
}

/* 명령줄에서 글자 규칙만 확인할 때 씁니다. */
export function charViolationsOf(rawText, rules) {
  return charViolations(stripCode(rawText), rules);
}
