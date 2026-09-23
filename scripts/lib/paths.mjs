/* 프로젝트 루트와 규칙 문서를 찾습니다. */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/* 설치된 프로젝트가 이 도구를 두는 디렉터리입니다. */
export const INSTALLED_DIR = '.korean-style';

/* 프로젝트 루트를 찾습니다. */
export function projectRoot() {
  const named = process.env.CLAUDE_PROJECT_DIR;
  if (typeof named === 'string' && named.length > 0) return resolve(named);
  const here = dirname(fileURLToPath(import.meta.url));
  const twoUp = resolve(here, '..', '..');
  /* 설치 디렉터리 안에 있으면 한 단계 더 올라갑니다. */
  return twoUp.split(sep).pop() === INSTALLED_DIR ? resolve(twoUp, '..') : twoUp;
}

/* 이 도구의 루트 디렉터리입니다. */
export function toolRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..');
}

/* 이 파일을 명령줄에서 직접 실행했는지 봅니다. */
export function isEntryPoint(metaUrl) {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const self = fileURLToPath(metaUrl);
  try {
    return realpathSync(entry) === realpathSync(self);
  } catch {
    return resolve(entry) === self;
  }
}

export function rulesDocPath(root = projectRoot()) {
  const named = process.env.KOREAN_STYLE_RULES;
  if (typeof named === 'string' && named.length > 0) {
    return isAbsolute(named) ? named : join(root, named);
  }
  const installed = join(root, INSTALLED_DIR, 'rules.md');
  if (existsSync(installed)) return installed;
  return join(root, 'docs', 'rules.md');
}

/* 보고에 쓸 짧은 이름입니다. */
export function rulesDocLabel(root = projectRoot()) {
  const full = rulesDocPath(root);
  return full.startsWith(root) ? full.slice(root.length + 1) : full;
}
