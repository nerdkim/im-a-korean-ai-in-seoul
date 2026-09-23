/* 소스 파일에서 한국어 주석만 남깁니다. */

/* 빗금 둘로 한 줄, 빗금과 별표로 여러 줄을 주석으로 삼는 언어들입니다. */
const SLASH_FAMILY = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.php', '.c', '.h',
  '.cc', '.cpp', '.hpp', '.cs', '.dart', '.scala', '.vue', '.svelte',
];

/* 우물 정 기호로 한 줄을 주석으로 삼는 언어들입니다. */
const HASH_FAMILY = ['.rb', '.sh', '.bash', '.zsh', '.ex', '.exs', '.yml', '.yaml', '.toml'];

/* 하이픈 둘로 한 줄을 주석으로 삼는 언어들입니다. */
const DASH_FAMILY = ['.sql', '.lua', '.hs'];

function extensionOf(relPath) {
  const at = relPath.lastIndexOf('.');
  return at === -1 ? '' : relPath.slice(at).toLowerCase();
}

/* 어느 주석 문법을 쓸지 정합니다. */
export function commentSyntaxOf(relPath) {
  const ext = extensionOf(relPath);
  if (SLASH_FAMILY.includes(ext)) return { line: '//', block: ['/*', '*/'], quotes: '"\'`' };
  if (ext === '.py') return { line: '#', block: null, docstring: true, quotes: '"\'' };
  if (HASH_FAMILY.includes(ext)) return { line: '#', block: null, quotes: '"\'' };
  if (DASH_FAMILY.includes(ext)) return { line: '--', block: ['/*', '*/'], quotes: '"\'' };
  return null;
}

const NEWLINE = '\n';

/* 주석 밖을 공백으로 덮습니다. */
export function onlyComments(text, syntax) {
  if (syntax === null) return text.replace(/[^\n]/g, ' ');

  const out = new Array(text.length).fill(' ');
  const keepRange = (from, to) => {
    for (let j = from; j < to && j < text.length; j += 1) {
      out[j] = text[j] === NEWLINE ? NEWLINE : text[j];
    }
  };
  const quotes = syntax.quotes ?? '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === NEWLINE) {
      out[i] = NEWLINE;
      i += 1;
      continue;
    }

    /* 파이썬 삼중 따옴표입니다. */
    if (syntax.docstring === true && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const mark = text.slice(i, i + 3);
      const end = text.indexOf(mark, i + 3);
      const stop = end === -1 ? text.length : end + 3;
      keepRange(i, stop);
      i = stop;
      continue;
    }

    /* 여러 줄 주석입니다. */
    if (syntax.block !== null && syntax.block !== undefined && text.startsWith(syntax.block[0], i)) {
      const end = text.indexOf(syntax.block[1], i + syntax.block[0].length);
      const stop = end === -1 ? text.length : end + syntax.block[1].length;
      keepRange(i, stop);
      i = stop;
      continue;
    }

    /* 한 줄 주석입니다. */
    if (text.startsWith(syntax.line, i)) {
      let j = i;
      while (j < text.length && text[j] !== NEWLINE) j += 1;
      keepRange(i, j);
      i = j;
      continue;
    }

    /* 따옴표 안입니다. */
    if (quotes.includes(c)) {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === c) {
          j += 1;
          break;
        }
        /* 줄이 끝나면 따옴표가 닫히지 않은 것입니다. */
        if (text[j] === NEWLINE) break;
        j += 1;
      }
      for (let k = i; k < j && k < text.length; k += 1) {
        if (text[k] === NEWLINE) out[k] = NEWLINE;
      }
      i = j;
      continue;
    }

    i += 1;
  }
  return out.join('');
}

/* 주석 표시를 공백으로 덮습니다. */
function withoutMarkers(line) {
  return line
    .replace(/\/\*+/g, (m) => ' '.repeat(m.length))
    .replace(/\*+\//g, (m) => ' '.repeat(m.length))
    .replace(/^(\s*)(\/\/+|#+|--+|\*+)/, (m, indent, mark) => indent + ' '.repeat(mark.length))
    .replace(/(\s)(\/\/+)/g, (m, space, mark) => space + ' '.repeat(mark.length));
}

/* 한글이 든 줄만 남기고 주석 표시를 덮습니다. */
function hangulLinesOnly(text) {
  return text
    .split(NEWLINE)
    .map((line) => (/[가-힣]/u.test(line) ? withoutMarkers(line) : line.replace(/[^\n]/g, ' ')))
    .join(NEWLINE);
}

/* 소스 파일에서 한국어 주석만 남긴 텍스트입니다. */
export function koreanCommentsOf(text, relPath) {
  return hangulLinesOnly(onlyComments(text, commentSyntaxOf(relPath)));
}
