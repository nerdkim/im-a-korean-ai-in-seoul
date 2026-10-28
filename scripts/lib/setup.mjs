import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { INSTALLED_DIR } from './paths.mjs';

/* hook 스크립트가 없는 작업 트리에서 UserPromptSubmit hook이 Claude에게 전하는 안내입니다. hook 명령이 이 안내를 작은따옴표로 감싸므로 안내에는 작은따옴표를 넣지 않습니다. */
export const MISSING_SCRIPTS_NOTICE =
  '이 작업 트리에는 한국어 작성 도구의 hook 스크립트(.korean-style/scripts/)가 없어서 한국어 검사가 동작하지 않습니다. ' +
  '이 스크립트는 Git에서 제외되므로 저장소를 새로 clone하거나 git worktree로 작업 트리를 만들면 설치 명령을 다시 실행해야 생깁니다. ' +
  '사용자에게 프로젝트 루트에서 처음 설치할 때 쓴 설치 명령을 다시 실행해 달라고 알려 주십시오. ' +
  '예: npx -y github:nerdkim/im-a-korean-ai-in-seoul --target .';

/* settings.json에 넣을 hook 명령을 만듭니다. 설치한 프로젝트에서는 hook 스크립트를 Git에서 제외하므로 저장소를 새로 clone하면 스크립트가 없습니다. 이때 node가 "Cannot find module"로 실패하지 않도록 스크립트가 있을 때만 실행합니다. 스크립트가 없으면 UserPromptSubmit hook만 안내를 남깁니다. 다른 hook은 아무것도 하지 않습니다. 이 도구의 저장소는 스크립트를 커밋하므로 스크립트를 바로 실행합니다. */
export function hookCommand(name, installed = true) {
  const script = `$CLAUDE_PROJECT_DIR/${installed ? `${INSTALLED_DIR}/` : ''}scripts/hooks/${name}.mjs`;
  if (!installed) return `node "${script}"`;
  const notice = name === 'userprompt' ? `; else echo '${MISSING_SCRIPTS_NOTICE}'` : '';
  return `f="${script}"; if [ -f "$f" ]; then node "$f"${notice}; fi`;
}

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

// 여러 작업 트리가 hook 하나를 같이 써도 이 hook은 커밋하는 작업 트리의 검사기를 실행합니다.
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
  const labels = { linked: 'commit-msg hook을 설치했습니다', already: 'commit-msg hook이 이미 설치되어 있습니다',
    occupied: '다른 commit-msg hook이 이미 있어 그대로 두었습니다. 사람이 직접 하거나 다른 프로그램으로 하는 커밋도 검사하려면 그 hook이 검사기를 실행하도록 고쳐야 합니다',
    broken: '기존 commit-msg hook의 symlink가 끊겼습니다. 그 hook을 복구해야 합니다',
    'not-git': '프로젝트 루트에 .git이 없어 commit-msg hook은 설치하지 않습니다.', would: 'commit-msg hook을 설치할 경로입니다' };
  console.log(`${labels[result.state] ?? result.state}${result.path ? `: ${result.path}` : ''}`);
}
