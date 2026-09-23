/* 규칙 모듈을 실행하고 위반을 경고와 오류로 나눕니다. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fenceRules, RULE_FENCE } from './rules.mjs';
import { onlyFenced, stripCode } from './text.mjs';
import { koreanCommentsOf } from './comments.mjs';
import { isDocPath, isSourcePath, TARGETS, targetForPath, toProjectRelative } from './targets.mjs';
import { charViolations } from './rules/chars.mjs';
import { registerViolations } from './rules/register.mjs';
import { punctuationViolations } from './rules/punctuation.mjs';
import { structureViolations } from './rules/structure.mjs';
import { translationeseViolations } from './rules/translationese.mjs';
import { vocabularyViolations } from './rules/vocabulary.mjs';
import { densityViolations } from './rules/density.mjs';

/* 텍스트 하나를 검사해 위반 목록을 돌려줍니다. */
export function checkText(input, rules, target = 'chat', options = {}) {
  if (typeof input !== 'string' || input.trim().length === 0) return [];
  if (!TARGETS.includes(target)) throw new Error(`알 수 없는 검사 대상입니다: ${target}`);

  /* 한글 자모를 완성형 음절로 합칩니다. */
  const rawText = input.normalize('NFC');

  const inFence = options.inFence === true;

  /* 소스 파일은 주석만 봅니다. */
  if (target === 'comment' && !inFence) {
    if (typeof options.path !== 'string') return [];
    const comments = koreanCommentsOf(rawText, options.path);
    if (comments.trim().length === 0) return [];
    /* 주석을 뽑아낸 텍스트를 `doc`으로 다시 봅니다. */
    return checkText(comments, rules, 'doc', { inFence: false });
  }

  const text = stripCode(rawText);
  const violations = [
    ...charViolations(text, rules),
    ...registerViolations(text, rules, target, inFence),
    ...punctuationViolations(text, rules),
    ...structureViolations(text, rules),
    ...translationeseViolations(text, rules),
    ...vocabularyViolations(text, rules, target),
    ...densityViolations(text, rules),
  ];

  if (!inFence) {
    const fenced = onlyFenced(rawText, [RULE_FENCE]);
    if (fenced.trim().length > 0) {
      for (const v of checkText(fenced, fenceRules(rules), target, { inFence: true })) {
        violations.push({
          ...v,
          detail: `${v.detail} fenced code block 안에서 찾은 위반입니다.`,
        });
      }
    }
  }

  violations.sort((a, b) => a.line - b.line);
  const advisory = new Set(rules.advisoryRules ?? []);
  return violations.map(v => ({ ...v, severity: advisory.has(v.rule) ? 'warning' : 'error' }));
}

export const blockingViolations = violations => violations.filter(v => v.severity !== 'warning');

/* 도구 호출 하나에서 사람이 읽을 문자열과 그 경로를 모읍니다. */
export function toolFieldTexts(toolName, input, rules, which = 'chatToolFields') {
  const wanted = rules[which].get(toolName);
  if (wanted === undefined || wanted.size === 0) return [];
  const out = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      const at = `${path}.${key}`;
      if (typeof v === 'string') {
        if (wanted.has(key) && v.trim().length > 0) out.push({ path: at, text: v });
        continue;
      }
      walk(v, at);
    }
  };
  walk(input, toolName);
  return out;
}

/* 도구 호출의 각 필드를 산문으로 검사합니다. */
export function checkToolCall(toolName, input, rules, target = 'chat') {
  const which = target === 'chat' ? 'chatToolFields' : 'agentToolFields';
  const problems = [];
  for (const { path, text } of toolFieldTexts(toolName, input, rules, which)) {
    for (const v of checkText(text, rules, target)) problems.push({ ...v, where: path });
  }
  return problems;
}

/* 보고 맨 아래에 붙이는 규칙 출처입니다. */
function sourceNote(rules) {
  if (rules.source === null) {
    return `  규칙 설정을 찾지 못했습니다.\n  경고: ${rules.reason} 기본 최소 규칙(문자, 호칭, 영어 답변)만 적용했습니다.`;
  }
  return `  규칙 문서: ${rules.source}`;
}

export function formatViolations(violations, rules, where) {
  const errors = blockingViolations(violations).length;
  const head = `한국어 검사: 오류 ${errors}건, 경고 ${violations.length - errors}건${where === undefined ? '' : ` (${where})`}`;
  const body = violations.map((v) => v.severity === 'warning'
    ? `  [${v.rule}] ${v.line}줄: ${v.detail} (경고: 문맥에 맞으면 유지)`
    : `  [${v.rule}] ${v.line}줄: ${v.detail}`);
  return [head, ...body, sourceNote(rules)].join('\n');
}

export function formatToolViolations(problems, rules) {
  const head = `한국어 문체 위반 ${problems.length}건 (이 도구 호출에 쓴 산문)`;
  const body = problems.map((p) => `  [${p.rule}] ${p.where}: ${p.detail}`);
  return [head, ...body, sourceNote(rules)].join('\n');
}

export function checkFile(absPath, rules, projectRoot, forcedTarget) {
  const rel = toProjectRelative(absPath, projectRoot) ?? absPath;
  const target = forcedTarget ?? targetForPath(rel, rules);
  if (target === null) return { rel, target: null, violations: [] };
  const violations = checkText(readFileSync(absPath, 'utf-8'), rules, target, { path: rel });
  return { rel, target, violations };
}

/* 검사할 파일 전부입니다. */
export function listCheckableFiles(root, rules) {
  const out = [];
  const skip = new Set(rules.sweepSkipDirs);
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        walk(p);
        continue;
      }
      const rel = relative(root, p);
      if (isDocPath(rel) || isSourcePath(rel)) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}
