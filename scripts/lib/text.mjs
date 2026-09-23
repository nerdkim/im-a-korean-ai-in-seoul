/* 텍스트를 규칙에 넘기기 전에 다듬고 나누는 공용 도구입니다. */

/* 한글 음절, 자모, 호환 자모입니다. */
export const HANGUL_SYLLABLE = /[가-힣]/u;
export const HANGUL_ANY = /[가-힣ᄀ-ᇿ㄰-㆏]/u;

/* 목록 표시입니다. */
export const LIST_MARK = /^\s*(?:[-*+]\s|\d+[.)]\s)/;

/* 정규식에서 특별한 뜻이 있는 글자를 이스케이프해 글자 그대로 찾게 합니다. */
export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* 문자 위치를 1부터 세는 줄 번호로 바꿉니다. */
export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/* 줄 수를 유지하면서 내용만 공백으로 덮습니다. */
function blank(s) {
  return s.replace(/[^\n]/g, ' ');
}

/* fenced block과 inline code를 공백으로 덮습니다. */
export function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, blank).replace(/`[^`\n]*`/g, blank);
}

/* {@link stripCode}와 달리 fenced block 안쪽만 남깁니다. exemptInfo에 든 블록은 덮습니다. */
export function onlyFenced(text, exemptInfo = []) {
  let inFence = false;
  let reading = false;
  return text
    .split('\n')
    .map((line) => {
      const open = /^\s*```(.*)$/.exec(line);
      if (open !== null) {
        inFence = !inFence;
        reading = inFence && !exemptInfo.includes(open[1].trim());
        return blank(line);
      }
      return inFence && reading ? line : blank(line);
    })
    .join('\n');
}

/* 장식 줄인지 봅니다. 글자나 숫자 없이 부호만 늘어놓은 줄입니다. */
function isDecorationLine(trimmed) {
  return trimmed.length >= 3 && !/[\p{L}\p{N}]/u.test(trimmed);
}

/* 따옴표 안을 공백으로 덮습니다. */
export function stripQuoted(text) {
  return text
    .replace(/"[^"\n]*"/g, blank)
    .replace(/“[^”\n]*”/g, blank)
    .replace(/[「『][^」』\n]*[」』]/g, blank)
    .replace(/'[^'\n]*'/g, (m) => (HANGUL_SYLLABLE.test(m) ? blank(m) : m));
}

/* 따옴표와 괄호 안, 숫자 사이의 쉼표를 지우고 문장에 직접 쓴 쉼표만 남깁니다. */
export function maskCommaAsides(text) {
  const commasToSpace = (piece) => piece.replace(/,/g, ' ');
  const quoted = text
    .replace(/"[^"\n]*"/g, commasToSpace)
    .replace(/“[^”\n]*”/g, commasToSpace)
    .replace(/[「『][^」』\n]*[」』]/g, commasToSpace)
    .replace(/'[^'\n]*'/g, (m) => (HANGUL_SYLLABLE.test(m) ? commasToSpace(m) : m));
  let depth = 0;
  let out = '';
  for (const ch of quoted) {
    if (ch === '(' || ch === '（') depth += 1;
    else if (ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
    out += ch === ',' && depth > 0 ? ' ' : ch;
  }
  return out.replace(/(\d),(?=\d)/gu, '$1 ');
}

/* 끝에 붙은 표시와 부호를 떼고 주어진 어미 가운데 하나로 끝나는지 봅니다. */
export function endsWithAny(text, endings) {
  /* 괄호를 떼기 전에는 닫는 괄호를 지우면 안 됩니다. */
  const withoutTail = text
    .trim()
    .replace(/[*_`\]}"'’”.!?\s]+$/u, '')
    .replace(/\([^()]*\)$/u, '');
  const tail = withoutTail.replace(/[*_`)\]}"'’”.!?\s]+$/u, '').trim();
  return endings.some((ending) => tail.endsWith(ending));
}

export function isKoreanProse(sentence, finalEndings, minRatio) {
  const bare = sentence.replace(/\s+/g, '');
  if (bare.length === 0) return false;
  if (hangulLength(sentence) / bare.length < minRatio) return false;
  if (finalEndings.length === 0) return true;
  /* 물음표와 느낌표로 끝나는 것도 문장입니다. */
  if (/[가-힣][?!][)\]"'’”*_`\s]*$/u.test(sentence.trim())) return true;
  return endsWithAny(sentence, finalEndings);
}

/* 한 문장으로 판정할 조각들입니다. */
export function sentencesOf(text) {
  const out = [];
  const push = (piece, at) => {
    /* 굵게 표시한 강조를 닫는 기호가 마침표 뒤에 올 수 있습니다. */
    for (const part of piece.split(/(?<=[.!?]\*{0,2})\s+/)) {
      if (part.trim().length > 0) out.push({ text: part, index: at });
      at += part.length + 1;
    }
  };

  let start = -1;
  let offset = 0;
  const flush = (end) => {
    if (start >= 0) push(text.slice(start, end).replace(/\n/g, ' '), start);
    start = -1;
  };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const solo = /^[|#>]/.test(trimmed);
    const decoration = isDecorationLine(trimmed);
    if (trimmed.length === 0 || solo || decoration || LIST_MARK.test(line)) {
      flush(offset === 0 ? 0 : offset - 1);
    }
    if (trimmed.length > 0) {
      if (/^\|/.test(trimmed)) {
        let at = offset;
        for (const cell of line.split('|')) {
          push(cell, at);
          at += cell.length + 1;
        }
      } else if (!/^#/.test(trimmed) && !decoration) {
        if (start < 0) start = offset;
      }
    }
    offset += line.length + 1;
  }
  flush(text.length);
  return out;
}

/* 강조 개수처럼 문단이나 항목 단위로 세는 규칙이 쓰는 단위입니다. */
export function unitsOf(text) {
  const out = [];
  let buffer = [];
  let start = 1;
  const flush = () => {
    if (buffer.length > 0) out.push({ text: buffer.join('\n'), line: start });
    buffer = [];
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const n = i + 1;
    if (line.trim().length === 0 || line.trim() === '>' || /^\s*#/.test(line)) {
      flush();
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flush();
      out.push({ text: line, line: n });
      continue;
    }
    if (LIST_MARK.test(line)) {
      flush();
      start = n;
      buffer = [line];
      continue;
    }
    if (buffer.length === 0) start = n;
    buffer.push(line);
  }
  flush();
  return out;
}

/* 어절 수입니다. */
export function wordCount(segment) {
  return segment
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/* 공백을 뺀 글자 수입니다. */
export function proseLength(text) {
  return text.replace(/\s+/g, '').length;
}

/* 한글 음절 수입니다. */
export function hangulLength(text) {
  return (text.match(/[가-힣]/gu) ?? []).length;
}

/* 밀도가 한도를 넘었는지 봅니다. 밀도 규칙 여섯 개가 함께 씁니다. */
export function overDensity(count, size, limit, rules) {
  if (limit <= 0 || size <= 0) return null;
  if (count < rules.densityRuleFloor) return null;
  const density = (count / size) * 1000;
  const required = limit * (1 + rules.densityMargin / Math.sqrt(count));
  return density > required ? density : null;
}

/* 어미가 나타나는 위치를 모두 찾습니다. */
export function findAllEndings(text, ending, exemptWords = []) {
  const re = new RegExp(`[\\uAC00-\\uD7A3]${escapeRe(ending)}(?=[\\s.!?,()\\]（"'\`\\n]|$)`, 'gu');
  const out = [];
  for (const candidate of text.matchAll(re)) {
    const end = candidate.index + candidate[0].length;
    const exempt = exemptWords.some(
      (word) => end >= word.length && text.slice(end - word.length, end) === word,
    );
    if (!exempt) out.push(candidate);
  }
  return out;
}

/* {@link findAllEndings}에서 첫 위치만 필요할 때 씁니다. */
export function findEnding(text, ending, exemptWords = []) {
  return findAllEndings(text, ending, exemptWords)[0] ?? null;
}

/* 서로 가까이 붙어 나열을 이루는 위치를 뺍니다. */
export function withoutEnumerations(hits, window = 36) {
  const at = hits.map((m) => m.index);
  return hits.filter((m) => !at.some((other) => other !== m.index && Math.abs(other - m.index) <= window));
}
