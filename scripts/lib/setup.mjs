import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

export function readSettings(path) {
  if (!existsSync(path)) return null;
  try {
    const s = JSON.parse(readFileSync(path, 'utf8'));
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('최상위 값이 객체가 아닙니다');
    if (s.hooks !== undefined && (!s.hooks || typeof s.hooks !== 'object' || Array.isArray(s.hooks) ||
      Object.values(s.hooks).some(list => !Array.isArray(list) || list.some(e => !e || !Array.isArray(e.hooks) ||
        e.hooks.some(h => !h || typeof h !== 'object'))))) throw new Error('hooks 형식이 올바르지 않습니다');
    return s;
  } catch (error) { throw new Error(`설정 파일을 읽을 수 없습니다: ${path} (${error.message})`); }
}

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function localSettingsPaths(root) {
  const paths = [join(root, '.claude/settings.local.json')];
  if (existsSync(join(root, '.git')) && lstatSync(join(root, '.git')).isFile()) {
    const main = git(root, ['worktree', 'list', '--porcelain'])?.split('\n')[0].replace(/^worktree /, '');
    if (main && resolve(main) !== resolve(root)) paths.push(join(main, '.claude/settings.local.json'));
  }
  return paths;
}

export function commitHookPath(root) {
  if (!existsSync(join(root, '.git'))) return null;
  const path = git(root, ['rev-parse', '--git-path', 'hooks/commit-msg']);
  return path ? resolve(root, path) : null;
}

// 공유 hook이라도 커밋하는 checkout의 검사기를 씁니다.
const HOOK_MARKER = '// korean-style commit hook';
const COMMIT_LAUNCHER = `#!/usr/bin/env node
${HOOK_MARKER}
(async () => {
  const { spawnSync } = await import('node:child_process');
  const { existsSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (repo.status !== 0) process.exit(0);
  const root = repo.stdout.trim();
  let script = join(root, '.korean-style/scripts/hooks/commit-msg.mjs');
  if (!existsSync(script)) {
    try { if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== 'im-a-korean-ai-in-seoul') process.exit(0); }
    catch { process.exit(0); }
    script = join(root, 'scripts/hooks/commit-msg.mjs');
  }
  if (!existsSync(script)) process.exit(0);
  const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, CLAUDE_PROJECT_DIR: root }
  });
  process.exit(result.status ?? 1);
})().catch(error => { console.error(error.message); process.exit(1); });
`;

export function commitHookState(root) {
  const path = commitHookPath(root);
  if (!path) return { state: 'not-git' };
  let stat;
  try { stat = lstatSync(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!stat) return { state: 'missing', path };
  const link = stat.isSymbolicLink() ? readlinkSync(path) : '';
  const ownedLink = /(?:^|\/)\.korean-style\/scripts\/hooks\/commit-msg\.mjs$/.test(link) ||
    (link && resolve(dirname(path), link) === join(root, 'scripts/hooks/commit-msg.mjs'));
  if (!existsSync(path)) return { state: 'broken', path, owned: ownedLink };
  const body = readFileSync(path, 'utf8');
  const owned = ownedLink || body.includes(HOOK_MARKER);
  const mode = stat.isSymbolicLink() ? lstatSync(resolve(dirname(path), link)).mode : stat.mode;
  return { state: owned ? 'owned' : 'occupied', path, executable: !!(mode & 0o111), current: body === COMMIT_LAUNCHER };
}

export function installCommitHook(root, dry = false) {
  const current = commitHookState(root);
  if (current.state === 'not-git' || current.state === 'occupied' ||
      (current.state === 'broken' && !current.owned)) return current;
  if (current.current && current.executable) return { ...current, state: 'already' };
  if (dry) return { ...current, state: 'would' };
  mkdirSync(dirname(current.path), { recursive: true });
  rmSync(current.path, { force: true });
  writeFileSync(current.path, COMMIT_LAUNCHER, { mode: 0o755 });
  return { state: 'linked', path: current.path };
}

export function reportCommitHook(result) {
  const labels = { linked: '커밋 메시지 hook을 설치했습니다', already: '커밋 메시지 hook이 이미 설치되어 있습니다',
    occupied: '커밋 메시지를 검사하려면 기존 hook에서 검사기를 호출합니다. 기존 커밋 hook은 그대로 둡니다',
    broken: '기존 커밋 hook의 연결이 끊겼습니다. 해당 hook을 복구해야 합니다',
    'not-git': '프로젝트 루트에 .git이 없어 커밋 hook은 생략합니다', would: '커밋 hook을 설치할 경로입니다' };
  console.log(`${labels[result.state] ?? result.state}${result.path ? `: ${result.path}` : ''}`);
}
