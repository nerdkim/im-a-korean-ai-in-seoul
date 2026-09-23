/* 검사 대상 종류입니다. */
import { relative, resolve, sep } from 'node:path';

export const TARGETS = ['chat', 'doc', 'comment', 'commit'];

/* 사람이 직접 읽으므로 존대와 어투 규칙이 모두 걸리는 종류입니다. */
export const HUMAN_TARGETS = new Set(['chat']);

/* 한국어 산문이 들어 있어서 한국어 문법 규칙이 걸리는 종류입니다. */
export const KOREAN_TARGETS = new Set(['chat', 'doc', 'comment', 'commit']);

/* glob을 정규식으로 바꿉니다. */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    out += /[.+^${}()|[\]\\?]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${out}$`);
}

export function matchesAny(relPath, globs) {
  const p = relPath.split(sep).join('/');
  return globs.some((g) => globToRegExp(g).test(p));
}

/* 프로젝트 루트 기준 상대 경로입니다. */
export function toProjectRelative(filePath, projectRoot) {
  const rel = relative(projectRoot, resolve(filePath));
  if (rel.startsWith('..') || rel.length === 0) return null;
  return rel.split(sep).join('/');
}

/* 소스 파일로 볼 확장자입니다. */
const SOURCE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.py', '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.rb', '.php',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.sh', '.bash', '.zsh',
  '.sql', '.vue', '.svelte', '.dart', '.scala', '.ex', '.exs', '.lua',
];

export function isSourcePath(relPath) {
  return SOURCE_EXTENSIONS.some((ext) => relPath.toLowerCase().endsWith(ext));
}

export function isDocPath(relPath) {
  return /\.(?:md|mdx|markdown)$/i.test(relPath);
}

/* 파일 하나에 어떤 종류를 적용할지 결정합니다. */
export function targetForPath(relPath, rules) {
  if (matchesAny(relPath, rules.skipGlobs)) return null;
  if (rules.docGlobs.length > 0 && matchesAny(relPath, rules.docGlobs)) return 'doc';
  if (rules.sourceGlobs.length > 0 && matchesAny(relPath, rules.sourceGlobs)) return 'comment';
  if (isDocPath(relPath)) return 'doc';
  if (isSourcePath(relPath)) return 'comment';
  return null;
}
