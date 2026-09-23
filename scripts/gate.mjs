#!/usr/bin/env node
/* 명령 하나로 모든 검사를 실행합니다. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { isEntryPoint, projectRoot, rulesDocPath, toolRoot } from './lib/paths.mjs';

/* 검사할 프로젝트입니다. */
const ROOT = projectRoot();

/* 이 도구의 루트 경로입니다. */
const TOOL = toolRoot();

/* `--self-check`가 없어도 되는 진입점과 그 이유입니다. */
const SELF_CHECK_EXEMPT = {
  'gate.mjs': '이 파일 자신입니다. gate를 검사하는 단계를 gate가 실행하면 결과가 자기 참조가 됩니다.',
};

/* hook은 stdin으로 harness가 주는 JSON을 받으므로 명령줄 자체 검사를 두지 않습니다. */
const HOOK_DIR = 'hooks';

/* 돌릴 테스트 파일입니다. */
function testFiles() {
  const dir = join(TOOL, 'test');
  /* 설치된 프로젝트에는 `test/`가 없습니다. */
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join(dir, name));
  if (found.length === 0) throw new Error('test/에 테스트 파일이 없습니다');
  return found;
}

function listScripts() {
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        walk(join(dir, e.name), prefix === '' ? e.name : `${prefix}/${e.name}`);
        continue;
      }
      if (!e.name.endsWith('.mjs')) continue;
      out.push({ rel: prefix === '' ? e.name : `${prefix}/${e.name}`, abs: join(dir, e.name), dir: prefix, name: e.name });
    }
  };
  walk(join(TOOL, 'scripts'), '');
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/* 도구 안의 스크립트 하나를 가리키는 절대 경로입니다. */
const script = (...parts) => join(TOOL, 'scripts', ...parts);

function run(label, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync('node', args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  const code = r.status ?? 1;
  if (code !== 0) process.stdout.write(`실패: ${label} (종료 코드 ${code})\n`);
  return code === 0;
}

/* 자체 검사 계약을 확인합니다. */
function selfCheckContract(scripts) {
  const missing = [];
  const exempt = [];
  for (const s of scripts) {
    if (SELF_CHECK_EXEMPT[s.name] !== undefined) {
      exempt.push({ name: s.rel, reason: SELF_CHECK_EXEMPT[s.name] });
      continue;
    }
    /* `lib/` 아래는 모듈이고 진입점이 아닙니다. */
    if (s.dir.startsWith('lib')) continue;
    if (s.dir === HOOK_DIR) {
      exempt.push({
        name: s.rel,
        reason: 'hook은 stdin으로 harness의 JSON을 받으므로 명령줄 자체 검사가 없습니다. 대신 test/의 테스트가 검사합니다.',
      });
      continue;
    }
    if (!readFileSync(s.abs, 'utf-8').includes('--self-check')) missing.push(s.rel);
  }
  process.stdout.write('\n=== 자체 검사 계약 ===\n');
  process.stdout.write(`자체 검사가 없는 진입점: ${missing.length}개\n`);
  for (const rel of missing) process.stdout.write(`  없음: ${rel}\n`);
  process.stdout.write(`면제: ${exempt.length}개\n`);
  for (const e of exempt) process.stdout.write(`  ${e.name}: ${e.reason}\n`);
  return missing.length === 0;
}

function main() {
  const only = process.argv.includes('--self-check-only');
  const results = [];

  results.push(['자체 검사 계약', selfCheckContract(listScripts())]);
  results.push(['검사기 자체 검사', run('검사기 자체 검사', [script('check-korean.mjs'), '--self-check'])]);
  /* 설치 스크립트는 설치된 프로젝트로 복사되지 않습니다. */
  if (existsSync(script('install.mjs'))) {
    results.push(['설치 스크립트 자체 검사', run('설치 스크립트 자체 검사', [script('install.mjs'), '--self-check'])]);
  }

  if (!only) {
    /* 규칙 문서는 자기 규칙을 통과해야 합니다. */
    const doc = relative(ROOT, rulesDocPath(ROOT));
    results.push(['규칙 문서 검사', run('규칙 문서 검사', [script('check-korean.mjs'), '--file', doc])]);
    results.push(['전체 파일 검사', run('전체 파일 검사', [script('check-korean.mjs'), '--all'])]);
    /* 파일 이름을 손으로 적지 않습니다. */
    const tests = testFiles();
    if (tests === null) {
      /* 건너뛰었다는 사실을 반드시 출력합니다. */
      process.stdout.write('\n=== 테스트 ===\n설치된 프로젝트에는 test/가 없으므로 건너뜁니다. 도구 저장소에서 실행하십시오.\n');
    } else {
      results.push(['테스트', run('테스트', ['--test', ...tests])]);
    }
  }

  process.stdout.write('\n=== 정리 ===\n');
  let bad = 0;
  for (const [label, ok] of results) {
    if (!ok) bad += 1;
    process.stdout.write(`  ${ok ? '통과' : '실패'}  ${label}\n`);
  }
  process.stdout.write(bad === 0 ? '\ngate 통과\n' : `\ngate 실패: ${bad}개 단계\n`);
  process.exit(bad === 0 ? 0 : 1);
}

const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) main();
