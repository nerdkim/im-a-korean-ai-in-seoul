#!/usr/bin/env node
/* 이 도구를 다른 프로젝트에 설치합니다. */
import {
  cpSync,
  existsSync,
  mkdirSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { INSTALLED_DIR, isEntryPoint } from './lib/paths.mjs';
import { readSettings, localSettingsPaths, installCommitHook, reportCommitHook } from './lib/setup.mjs';
export { installCommitHook, reportCommitHook } from './lib/setup.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(HERE, '..');

/* 설치할 skill입니다. */
const SKILL_NAMES = ['korean-style', 'korean-rewrite'];

/* skill 하나를 설치할 경로입니다. */
const skillDirFor = (name) => join('.claude', 'skills', name);

/* .gitignore와 경로 검사에 쓰는 POSIX 형식 skill 경로입니다. */
const skillDirPosixFor = (name) => `.claude/skills/${name}`;

/* output-style을 둘 디렉터리입니다. */
const OUTPUT_STYLE_DIR = join('.claude', 'output-styles');

/* .gitignore와 경로 검사에 쓰는 POSIX 형식 output-style 경로입니다. */
const OUTPUT_STYLE_DIR_POSIX = '.claude/output-styles';

/* output-style의 이름입니다. */
const OUTPUT_STYLE_NAME = 'korean-style';

/* .gitignore에서 이 도구가 넣은 줄을 알아보는 표시입니다. */
const GITIGNORE_MARKER = '# korean-style 설치 산출물입니다. rules.md만 이 프로젝트의 것입니다';

/* 대상 저장소의 .gitignore에 더할 줄입니다. */
export const GITIGNORE_LINES = [
  GITIGNORE_MARKER,
  `${INSTALLED_DIR}/*`,
  `!${INSTALLED_DIR}/rules.md`,
  `!${INSTALLED_DIR}/defaults.sha256`,
  ...SKILL_NAMES.map((name) => `${skillDirPosixFor(name)}/`),
  `${OUTPUT_STYLE_DIR_POSIX}/${OUTPUT_STYLE_NAME}.md`,
];

/* 대상 프로젝트가 이 도구를 부를 때 쓰는 경로입니다. */
const HOOK_BASE = `$CLAUDE_PROJECT_DIR/${INSTALLED_DIR}/scripts/hooks`;

/* settings.json에서 이 도구의 hook 명령을 알아보는 표시입니다. */
const MARKER = `${INSTALLED_DIR}/scripts/hooks/`;

const HOOKS = {
  PreToolUse: {
    matcher: 'Write|Edit|MultiEdit|NotebookEdit|AskUserQuestion|ExitPlanMode|SendUserFile|Task|Agent|Bash',
    command: `node "${HOOK_BASE}/pretooluse.mjs"`,
    statusMessage: '한국어 문체 규칙 확인',
  },
  Stop: {
    command: `node "${HOOK_BASE}/stop.mjs"`,
    statusMessage: '이 turn의 답변 문체 확인',
  },
};

export const RULES_REGISTER_LINE = /^register:.*$/m;

/* 어투 조각의 파일 이름입니다. */
export const REGISTER_FRAGMENTS = {
  다나까체: 'danaka.md',
  해요체: 'hayo.md',
  혼용: 'honyong.md',
};

/* skill에서 어투 조각을 넣을 구간입니다. */
export const REGISTER_SLOT = /<!-- register:begin -->[\s\S]*?<!-- register:end -->/;

/* skill의 어투 구간을 고른 조각으로 바꿉니다. */
export function skillWithRegister(body, fragment) {
  const filled = `<!-- register:begin -->\n${fragment.trim()}\n<!-- register:end -->`;
  return body.replace(REGISTER_SLOT, () => filled);
}

/* hook 설정을 합칩니다. */
export function mergeHookSettings(existing, hooks = HOOKS) {
  const out = { ...(existing ?? {}), hooks: { ...(existing?.hooks ?? {}) } };
  const added = [];
  for (const [event, spec] of Object.entries(hooks)) {
    let found = false;
    const list = (out.hooks[event] ?? []).flatMap(entry => {
      const kept = entry.hooks.filter(h => {
        const owned = h.type === 'command' && typeof h.command === 'string' &&
          h.command.includes(`${MARKER}${event === 'Stop' ? 'stop' : 'pretooluse'}.mjs`);
        if (owned) found = true;
        return !owned;
      });
      return kept.length ? [{ ...entry, hooks: kept }] : [];
    });
    list.push({ ...(spec.matcher ? { matcher: spec.matcher } : {}),
      hooks: [{ type: 'command', command: spec.command, statusMessage: spec.statusMessage }] });
    out.hooks[event] = list;
    if (!found) added.push(event);
  }
  return { settings: out, added };
}

/* 대상이 고른 output-style이 없을 때만 이 도구의 것을 기본값으로 둡니다. */
export function mergeOutputStyle(settings, name = OUTPUT_STYLE_NAME) {
  const out = settings === null || typeof settings !== 'object' ? {} : { ...settings };
  const current = out.outputStyle;
  if (typeof current === 'string' && current.length > 0) return { settings: out, set: false, kept: current };
  out.outputStyle = name;
  return { settings: out, set: true, kept: null };
}

export function mergeGitignore(existing, lines = GITIGNORE_LINES) {
  const before = typeof existing === 'string' ? existing : '';
  if (before.includes(GITIGNORE_MARKER)) {
    const missing = lines.filter(line => !before.split('\n').includes(line));
    return { text: missing.length ? `${before.trimEnd()}\n${missing.join('\n')}\n` : before, added: missing.length > 0 };
  }
  if (before.includes(INSTALLED_DIR)) return { text: before, added: false };
  const head = before.length === 0 || before.endsWith('\n') ? before : `${before}\n`;
  const gap = head.length === 0 || head.endsWith('\n\n') ? '' : '\n';
  return { text: `${head}${gap}${lines.join('\n')}\n`, added: true };
}

function selfCheck() {
  let failed = 0;
  const report = (ok, label) => {
    if (!ok) failed += 1;
    process.stdout.write(`${ok ? '  ok  ' : '  실패'} ${label}\n`);
  };

  report(mergeHookSettings({}).added.length === 2, '빈 설정에 hook 둘을 더한다');
  report(mergeHookSettings(null).added.length === 2, '설정 파일이 없어도 더한다');

  /* 두 번 합쳐도 하나여야 합니다. */
  const once = mergeHookSettings({}).settings;
  const twice = mergeHookSettings(once);
  report(twice.added.length === 0 && twice.settings.hooks.PreToolUse.length === 1, '두 번 설치해도 항목이 하나다');

  /* 대상 프로젝트에 다른 hook이 이미 있으면 그 hook이 남아야 합니다. */
  const mine = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo 남의 hook' }] }] } };
  const merged = mergeHookSettings(mine).settings;
  report(
    merged.hooks.Stop.length === 2 && merged.hooks.Stop[0].hooks[0].command === 'echo 남의 hook',
    '대상 프로젝트의 기존 hook을 지우지 않는다',
  );

  /* 설정의 다른 부분도 남아야 합니다. */
  const withEnv = mergeHookSettings({ env: { FOO: 'bar' } }).settings;
  report(withEnv.env?.FOO === 'bar', 'hook 밖의 설정을 지우지 않는다');

  /* 어투 치환이 그 줄만 바꾸는지 확인합니다. */
  const swapped = 'register: 다나까체\nbanned-address: 당신\n'.replace(RULES_REGISTER_LINE, 'register: 해요체');
  report(swapped === 'register: 해요체\nbanned-address: 당신\n', '어투 줄만 바꾼다');

  /* 어투 조각이 register 표시 사이에만 들어가는지 확인합니다. */
  const body = '# 제목\n<!-- register:begin -->\n옛 조각입니다.\n<!-- register:end -->\n남은 산문입니다.\n';
  const filled = skillWithRegister(body, '새 조각입니다.');
  report(
    filled.includes('새 조각입니다.') && !filled.includes('옛 조각입니다.') && filled.includes('남은 산문입니다.'),
    '어투 조각은 register 표시 사이에만 들어간다',
  );

  /* 달러 기호가 치환 패턴으로 읽히면 디스크에 남는 글이 달라집니다. */
  report(skillWithRegister(body, '값은 $1 입니다.').includes('$1'), '조각의 달러 기호를 치환 패턴으로 읽지 않는다');

  /* 어투 이름 셋마다 조각 파일이 있어야 합니다. */
  report(
    Object.keys(REGISTER_FRAGMENTS).length === 3 &&
      Object.values(REGISTER_FRAGMENTS).every((name) => existsSync(join(SOURCE_ROOT, 'skill', 'korean-style', 'register', name))),
    '어투 이름마다 조각 파일이 있다',
  );

  /* gitignore 병합을 확인합니다. */
  const ignoreOnce = mergeGitignore('');
  report(ignoreOnce.added && ignoreOnce.text.includes(`${INSTALLED_DIR}/*`), '빈 gitignore에 줄을 더한다');
  report(mergeGitignore(ignoreOnce.text).added === false, '두 번 더해도 줄이 쌓이지 않는다');

  /* 규칙 문서를 빼면 그 프로젝트가 고친 값이 clean checkout에서 사라집니다. */
  report(ignoreOnce.text.includes(`!${INSTALLED_DIR}/rules.md`), '규칙 문서는 Git에서 제외하지 않는다');

  /* 디렉터리 자체를 빼면 git이 그 안을 보지 않아서 부정 패턴이 적용되지 않습니다. */
  report(!new RegExp(`^\\${INSTALLED_DIR}/$`, 'm').test(ignoreOnce.text), '디렉터리 자체가 아니라 그 안의 파일을 Git에서 제외한다');

  /* 남의 줄을 지우면 설치가 피해를 줍니다. */
  const keepMine = mergeGitignore('node_modules/\ndist/\n');
  report(keepMine.text.startsWith('node_modules/\ndist/\n'), '대상의 기존 gitignore 줄을 지우지 않는다');

  /* 이 도구의 경로가 이미 적힌 파일은 손대지 않습니다. */
  report(mergeGitignore(`${INSTALLED_DIR}/\n`).added === false, '이 도구의 경로가 이미 적힌 gitignore는 손대지 않는다');

  process.stdout.write(failed === 0 ? '자체 검사 통과\n' : `자체 검사 실패: ${failed}건\n`);
  return failed === 0;
}

const usage = '사용법: --target <경로> [--register 다나까체|해요체|혼용] [--activate] [--dry-run] [--force] | --self-check';
const hashRules = text => createHash('sha256').update(text.replace(RULES_REGISTER_LINE, 'register:')).digest('hex');

function assertWritablePath(root, rel) {
  let path = root;
  for (const part of rel.split('/')) {
    path = join(path, part);
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error(`설치 경로의 symlink는 덮어쓰지 않습니다: ${path}`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (existsSync(path) && lstatSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) assertWritablePath(root, `${rel}/${entry}`);
  }
}

function main() {
  const { values: args } = parseArgs({ options: {
    target: { type: 'string' }, register: { type: 'string' },
    activate: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, force: { type: 'boolean' },
    'self-check': { type: 'boolean' }, help: { type: 'boolean' },
  }});
  if (args['self-check']) { process.exitCode = selfCheck() ? 0 : 1; return; }
  if (args.help) { console.log(usage); return; }
  if (!args.target) throw new Error(usage);
  const root = realpathSync(resolve(args.target));
  if (!lstatSync(root).isDirectory()) throw new Error(`대상은 디렉터리여야 합니다: ${root}`);
  if (root === realpathSync(SOURCE_ROOT)) throw new Error('이 도구의 저장소에는 설치하지 않습니다.');
  if (args.register !== undefined && !Object.hasOwn(REGISTER_FRAGMENTS, args.register)) {
    throw new Error('--register는 다나까체, 해요체, 혼용 중 하나여야 합니다.');
  }
  const installDir = join(root, INSTALLED_DIR);
  const rulesTarget = join(installDir, 'rules.md');
  const hashTarget = join(installDir, 'defaults.sha256');
  const before = existsSync(rulesTarget) ? readFileSync(rulesTarget, 'utf8') : null;
  const register = args.register ?? before?.match(RULES_REGISTER_LINE)?.[0].split(':')[1].trim() ?? '다나까체';
  if (!Object.hasOwn(REGISTER_FRAGMENTS, register)) throw new Error(`알 수 없는 어투: ${register}`);
  const defaults = readFileSync(join(SOURCE_ROOT, 'docs/rules.md'), 'utf8').replace(RULES_REGISTER_LINE, `register: ${register}`);
  const baseHash = existsSync(hashTarget) ? readFileSync(hashTarget, 'utf8').trim() : null;
  const refresh = !before || args.force || hashRules(before) === baseHash || hashRules(before) === hashRules(defaults);
  let rules = refresh ? defaults : before;
  if (args.register) {
    if (!RULES_REGISTER_LINE.test(rules)) throw new Error('기존 규칙에 register 줄이 없습니다. 규칙을 복구하거나 --force를 사용합니다.');
    rules = rules.replace(RULES_REGISTER_LINE, `register: ${register}`);
  }
  const backup = args.force && before && before !== rules
    ? join(installDir, `rules.backup-${createHash('sha256').update(before).digest('hex').slice(0, 12)}.md`) : null;
  const settingsPath = join(root, '.claude/settings.json');
  const existing = readSettings(settingsPath);
  const local = localSettingsPaths(root).map(path => ({ path, settings: readSettings(path) }));
  const { settings, added } = mergeHookSettings(existing);
  const style = mergeOutputStyle(args.activate ? { ...settings, outputStyle: OUTPUT_STYLE_NAME } : settings);
  const ignorePath = join(root, '.gitignore');
  const ignoreBefore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  const hasGit = existsSync(join(root, '.git'));
  const ignore = hasGit ? mergeGitignore(ignoreBefore) : { text: ignoreBefore, added: false };

  for (const rel of [INSTALLED_DIR, '.claude/settings.json', ...SKILL_NAMES.map(skillDirPosixFor),
    `${OUTPUT_STYLE_DIR_POSIX}/${OUTPUT_STYLE_NAME}.md`, ...(hasGit ? ['.gitignore'] : [])]) assertWritablePath(root, rel);
  if (!before) {
    for (const rel of [...SKILL_NAMES.map(name => `${skillDirPosixFor(name)}/SKILL.md`), `${OUTPUT_STYLE_DIR_POSIX}/${OUTPUT_STYLE_NAME}.md`]) {
      if (existsSync(join(root, rel))) throw new Error(`같은 이름의 기존 파일은 덮어쓰지 않습니다: ${rel}`);
    }
  }
  // 로컬 설정은 진단만 합니다. worktree의 다른 checkout 설정도 바꾸지 않습니다.
  console.log(`대상: ${root}\n규칙: ${refresh ? '최신 기본값 적용' : '프로젝트의 기존 규칙 유지'} (${register})`);
  if (!refresh) console.log('새 기본 규칙이 필요하면 --force로 재설치합니다. 기존 규칙은 백업합니다.');
  if (backup) console.log(`규칙 백업: ${backup}`);
  if (style.settings.outputStyle !== OUTPUT_STYLE_NAME) console.log('기존 output-style을 유지합니다. 한국어 지침을 선택하려면 --activate를 사용합니다.');
  const effective = Object.assign({}, style.settings, ...local.map(x => x.settings));
  if (effective.disableAllHooks) console.log('주의: disableAllHooks가 켜져 있습니다. 해당 설정을 해제해야 hook이 실행됩니다.');
  if (effective.outputStyle !== style.settings.outputStyle) console.log('주의: settings.local.json의 outputStyle이 프로젝트 설정보다 우선합니다.');
  if (args['dry-run']) { reportCommitHook(installCommitHook(root, true)); console.log('--dry-run: 파일을 쓰지 않았습니다.'); return; }

  mkdirSync(installDir, { recursive: true });
  if (backup && !existsSync(backup)) writeFileSync(backup, before, { flag: 'wx' });
  for (const dir of ['scripts', 'docs']) rmSync(join(installDir, dir), { recursive: true, force: true });
  cpSync(join(SOURCE_ROOT, 'scripts'), join(installDir, 'scripts'), { recursive: true });
  for (const name of ['install.mjs', 'eval-korean.mjs']) rmSync(join(installDir, 'scripts', name));
  mkdirSync(join(installDir, 'docs'), { recursive: true });
  cpSync(join(SOURCE_ROOT, 'docs/limits.md'), join(installDir, 'docs/limits.md'));
  cpSync(join(SOURCE_ROOT, 'docs/rules.md'), join(installDir, 'docs/defaults.md'));
  cpSync(join(SOURCE_ROOT, 'LICENSE'), join(installDir, 'LICENSE'));
  writeFileSync(rulesTarget, rules);
  writeFileSync(hashTarget, hashRules(defaults) + '\n');
  const fragment = readFileSync(join(SOURCE_ROOT, 'skill/korean-style/register', REGISTER_FRAGMENTS[register]), 'utf8');
  for (const name of SKILL_NAMES) {
    const target = join(root, skillDirFor(name));
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'SKILL.md'), skillWithRegister(readFileSync(join(SOURCE_ROOT, 'skill', name, 'SKILL.md'), 'utf8'), fragment));
  }
  mkdirSync(join(root, OUTPUT_STYLE_DIR), { recursive: true });
  writeFileSync(join(root, OUTPUT_STYLE_DIR, `${OUTPUT_STYLE_NAME}.md`),
    skillWithRegister(readFileSync(join(SOURCE_ROOT, 'output-styles/korean-style.md'), 'utf8'), fragment));
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(style.settings, null, 2) + '\n');
  if (ignore.added) writeFileSync(ignorePath, ignore.text);
  console.log(`설치했습니다. 새 hook: ${added.join(', ') || '없음'}`);
  if (!hasGit) console.log('.git이 없어서 .gitignore를 수정하지 않았습니다. git init 후 다시 설치하면 필요한 항목을 추가합니다.');
  reportCommitHook(installCommitHook(root));
  console.log('적용하려면 대상 프로젝트에서 Claude 세션을 새로 시작합니다. Claude는 문체 진단이나 교정이 필요할 때만 skill을 읽습니다.');
  const quoted = "'" + join(installDir, 'scripts/doctor.mjs').replaceAll("'", "'\\''") + "'";
  console.log(`점검: node ${quoted}`);
}

const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
