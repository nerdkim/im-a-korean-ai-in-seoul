#!/usr/bin/env node
/* 실제 모델의 답변을 비교하는 스크립트입니다. 유료 API를 쓰므로 --run을 줄 때만 모델을 호출합니다. --with-hooks를 주면 이 도구를 설치한 프로젝트에서 hook과 skill이 실제로 동작합니다. 주지 않으면 모든 프로필의 프로젝트에서 hook과 skill, Claude Code의 내장 도구를 끕니다. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isEntryPoint } from './lib/paths.mjs';
import { loadRules } from './lib/rules.mjs';
import { blockingViolations, checkText } from './lib/check.mjs';
import { CHAR_CLASSES, SHORTCODE_RE } from './lib/rules/chars.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* 집계표에 쓰는 프로필 이름입니다. */
const PROFILE_LABELS = { baseline: '이 도구가 없는 프로젝트', installed: '이 도구를 설치한 프로젝트', legacy: '예전 작성 지침을 둔 프로젝트' };

/* Stop hook이 답변을 다시 쓰게 했는지 hook 출력으로 판단합니다. 출력이 JSON이 아니면 다시 쓰게 하지 않은 것으로 봅니다. */
function stopBlocked(responses) {
  return (responses ?? []).some((h) => {
    if (h?.event !== 'Stop') return false;
    try {
      return JSON.parse(h.output).decision === 'block';
    } catch {
      return false;
    }
  });
}

/*
 * 저장된 답변을 프로필마다 셉니다. 사람이 읽고 판단해야 하는 항목은 세지 않고 검사기와 기록으로 셀 수 있는 것만 셉니다.
 * emoji와 가운뎃점은 인라인 코드만 빼고 찾으므로 코드 블록 안에 있어도 셉니다.
 * 저장된 답변은 Stop hook이 다시 쓰게 했다면 다시 쓴 글이므로 다시 쓰게 한 답변 수도 함께 셉니다.
 */
export function summarize(rows, rules) {
  /* 프로필 이름이 `__proto__` 같은 값이어도 다른 객체에 속성이 생기지 않게 프로토타입 없는 객체에 모읍니다. */
  const out = Object.create(null);
  for (const row of rows) {
    if (!Array.isArray(row?.answers) || row.answers.some((answer) => typeof answer?.text !== 'string')) {
      throw new Error(`answers 배열이 없거나 답변 글(text)이 빠진 행입니다: ${JSON.stringify(row?.profile ?? null)}`);
    }
    const t = (out[row.profile] ??= { answers: 0, skill: 0, rewritten: 0, errors: 0, register: 0, emoji: 0, middot: 0, attribution: 0, chars: 0, costUsd: 0, seconds: 0,
      firstAnswers: 0, firstCostUsd: 0, repeatAnswers: 0, repeatCostUsd: 0 });
    t.costUsd += row.costUsd ?? 0;
    t.seconds += row.seconds ?? 0;
    /* 같은 요청을 다시 보내면 API가 처음 요청 때 캐시에 저장해 둔 입력을 다시 읽어 비용이 줄어듭니다. 그래서 다시 보낸 요청의 비용은 따로 셉니다. `run`이 없는 행은 처음 보낸 요청으로 봅니다. */
    if ((row.run ?? 1) > 1) {
      t.repeatAnswers += row.answers.length;
      t.repeatCostUsd += row.costUsd ?? 0;
    } else {
      t.firstAnswers += row.answers.length;
      t.firstCostUsd += row.costUsd ?? 0;
    }
    const rewritten = stopBlocked(row.hookResponses);
    for (const answer of row.answers) {
      const found = checkText(answer.text, rules, 'chat');
      const prose = answer.text.replace(/`[^`\n]*`/g, ' ');
      t.answers += 1;
      if ((row.skills ?? []).includes(rules.writingSkill)) t.skill += 1;
      if (rewritten) t.rewritten += 1;
      if (blockingViolations(found).length > 0) t.errors += 1;
      if (found.some((v) => v.rule === 'wrong-register')) t.register += 1;
      if (found.some((v) => v.rule === 'ai-attribution')) t.attribution += 1;
      if (CHAR_CLASSES.emoji.re.test(prose) || SHORTCODE_RE.test(prose)) t.emoji += 1;
      if (CHAR_CLASSES.middot.re.test(prose)) t.middot += 1;
      t.chars += [...answer.text].length;
    }
  }
  for (const t of Object.values(out)) {
    for (const key of ['costUsd', 'firstCostUsd', 'repeatCostUsd']) t[key] = Math.round(t[key] * 1e6) / 1e6;
  }
  return out;
}

/* `summarize`의 결과를 README에 옮길 수 있는 Markdown 표로 만듭니다. */
export function formatSummary(summary) {
  const profiles = Object.keys(summary);
  if (profiles.length === 0) throw new Error('셀 답변이 없습니다');
  /* 답변이 없는 프로필은 평균을 낼 수 없으므로 `-` 기호를 씁니다. */
  const ratio = (p, key, answers, digits, unit) => (summary[p][answers] === 0 ? '-' : `${(summary[p][key] / summary[p][answers]).toFixed(digits)}${unit}`);
  const average = (p, key, digits, unit) => ratio(p, key, 'answers', digits, unit);
  const count = (key) => profiles.map((p) => `${summary[p].answers}개 중 ${summary[p][key]}개`);
  /* 같은 요청을 다시 보낸 결과가 있으면 비용을 두 줄로 나눕니다. 그러면 캐시를 쓰지 못해 다시 보낸 요청의 비용이 줄지 않은 경우를 표에서 바로 알아볼 수 있습니다. */
  const cost = profiles.some((p) => summary[p].repeatAnswers > 0)
    ? [['처음 보낸 요청에서 답변 하나에 든 평균 비용', profiles.map((p) => ratio(p, 'firstCostUsd', 'firstAnswers', 3, '달러'))],
      ['같은 요청을 다시 보냈을 때 답변 하나에 든 평균 비용', profiles.map((p) => ratio(p, 'repeatCostUsd', 'repeatAnswers', 3, '달러'))]]
    : [['답변 하나에 든 평균 비용', profiles.map((p) => average(p, 'costUsd', 3, '달러'))]];
  const lines = [
    ['skill을 거친 답변', count('skill')],
    ['Stop hook이 다시 쓰게 한 답변', count('rewritten')],
    ['검사기가 오류를 찾은 답변', count('errors')],
    ['검사기가 해요체 어미를 찾은 답변', count('register')],
    ['emoji가 들어간 답변', count('emoji')],
    ['가운뎃점이 들어간 답변', count('middot')],
    ['Claude Code 생성 표시가 들어간 답변', count('attribution')],
    ['답변 길이 합계', profiles.map((p) => `${summary[p].chars.toLocaleString('en-US')}자`)],
    ...cost,
    ['답변 하나를 받는 데 걸린 평균 시간', profiles.map((p) => average(p, 'seconds', 1, '초'))],
  ];
  return [
    `| 항목 | ${profiles.map((p) => (Object.hasOwn(PROFILE_LABELS, p) ? PROFILE_LABELS[p] : p)).join(' | ')} |`,
    `| --- |${profiles.map(() => ' --- |').join('')}`,
    ...lines.map(([label, cells]) => `| ${label} | ${cells.join(' | ')} |`),
  ].join('\n');
}
export function answersOf(text, cases) {
  return cases.map(({ id }) => {
    const matches = [...text.matchAll(new RegExp(`<answer id="${id}">([\\s\\S]*?)</answer>`, 'g'))];
    if (matches.length !== 1) throw new Error(`답변이 없거나 중복되었습니다: ${id}`);
    return { id, text: matches[0][1].trim() };
  });
}

export function assessAnswer(answer, task) {
  const sentences = (answer.text.match(/[.!?](?=\s|$)/g) ?? []).length || (answer.text.trim() ? 1 : 0);
  return { ...answer, chars: [...answer.text].length, sentences,
    missing: [...task.must.filter(term => !answer.text.toLowerCase().includes(term.toLowerCase())),
      ...(task.mustAny ?? []).filter(group => !group.some(term => answer.text.includes(term))).map(group => group.join(' / '))],
    forbidden: (task.mustNot ?? []).filter(term => answer.text.includes(term)),
    overLength: [...answer.text].length > task.maxChars,
    metaComment: /\(\s*\d+문장\s*\)|원문이 이미 자연|원문이 자연|고칠 부분이 없|그대로 두었습니다/.test(answer.text),
    wrongSentenceCount: (task.sentences !== undefined && sentences !== task.sentences) ||
      (task.maxSentences !== undefined && sentences > task.maxSentences), rubric: task.rubric };
}

function main() {
  const args = process.argv.slice(2);
  const value = (key, fallback) => {
    const i = args.indexOf(key);
    if (i < 0) return fallback;
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${key} 다음에 값이 필요합니다`);
    return args[i + 1];
  };
  if (args.includes('--self-check')) {
    if (answersOf('<answer id="a">ok</answer>', [{ id: 'a' }])[0].text !== 'ok') throw new Error('답변을 읽지 못했습니다');
    console.log('eval 자체 검사를 통과했습니다. API는 호출하지 않았습니다.');
    return;
  }
  if (args.includes('--summary')) {
    /* `--summary` 바로 뒤에 이어 쓴 결과 디렉터리나 results.json 경로만 받습니다. API를 호출하지 않습니다. */
    const after = args.slice(args.indexOf('--summary') + 1);
    const end = after.findIndex((arg) => arg.startsWith('--'));
    if (end !== -1) throw new Error('--summary는 다른 옵션과 함께 쓰지 않습니다');
    const files = [...new Set(after.map((path) => resolve(path.endsWith('.json') ? path : join(path, 'results.json'))))];
    if (files.length === 0) throw new Error('--summary 다음에 평가 결과 경로가 필요합니다');
    const rows = files.flatMap((file) => {
      const results = JSON.parse(readFileSync(file, 'utf8')).results;
      if (!Array.isArray(results)) throw new Error(`평가 결과 파일이 아닙니다: ${file}`);
      return results;
    });
    console.log(formatSummary(summarize(rows, loadRules(join(ROOT, 'docs/rules.md')))));
    return;
  }
  if (!args.includes('--run')) {
    console.log('사용법: npm run eval -- --run [--models claude-sonnet-5-5,claude-opus-5-5] [--profiles baseline,installed] [--reference DIR] [--out DIR] [--repeat 1] [--individual] [--cases FILE] [--effort low] [--with-hooks] | --summary <결과 경로>...');
    return;
  }
  const cases = JSON.parse(readFileSync(resolve(value('--cases', join(ROOT, 'test/fixtures/eval/cases.json'))), 'utf8'));
  if (!Array.isArray(cases) || !cases.length || cases.some(c => !/^[a-z][a-z0-9-]*$/.test(c.id) ||
      typeof c.prompt !== 'string' || !Array.isArray(c.must) || c.must.some(t => typeof t !== 'string') ||
      (c.mustAny !== undefined && (!Array.isArray(c.mustAny) || c.mustAny.some(g => !Array.isArray(g) ||
        !g.length || g.some(t => typeof t !== 'string')))) ||
      (c.mustNot !== undefined && (!Array.isArray(c.mustNot) || c.mustNot.some(t => typeof t !== 'string' || !t))) ||
      !Number.isFinite(c.maxChars)) ||
      new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('평가 입력 파일의 형식이 올바르지 않습니다');
  const individual = args.includes('--individual');
  const withHooks = args.includes('--with-hooks');
  const effort = value('--effort', 'low');
  if (!['low', 'medium', 'high'].includes(effort)) throw new Error('--effort는 low, medium, high 가운데 하나여야 합니다');
  const models = value('--models', 'claude-sonnet-5-5,claude-opus-5-5').split(',');
  const profiles = value('--profiles', 'baseline,installed').split(',');
  const reference = value('--reference', null);
  if (reference && !profiles.includes('legacy')) profiles.splice(1, 0, 'legacy');
  if (profiles.includes('legacy') && !reference) throw new Error('legacy 프로필에는 --reference가 필요합니다');
  if (profiles.some(p => !['baseline', 'installed', 'legacy'].includes(p))) throw new Error('알 수 없는 프로필입니다');
  const repeat = Number(value('--repeat', '1'));
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('--repeat는 1부터 10까지의 정수여야 합니다');
  const out = resolve(value('--out', '.eval/latest'));
  if (existsSync(join(out, 'results.json'))) throw new Error('결과가 이미 있습니다. --out으로 새 경로를 지정하십시오.');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'cases.json'), JSON.stringify(cases, null, 2) + '\n');
  const batchPrompt = '각 요청에 독립적으로 답하세요. 결과만 <answer id="ID">답변</answer> 형식으로 출력하세요. 다른 설명은 붙이지 마세요.\n' + cases.map(c => `${c.id}: ${c.prompt}`).join('\n');
  const results = [];
  const hashes = {};
  const cli = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (cli.status !== 0) throw new Error('claude CLI를 실행할 수 없습니다');
  const scratch = mkdtempSync(join(tmpdir(), 'korean-bench-'));
  try {
    for (const profile of profiles) {
      const cwd = join(scratch, profile);
      mkdirSync(cwd);
      if (withHooks && profile === 'installed') {
        const install = spawnSync('node', [join(ROOT, 'scripts/install.mjs'), '--target', cwd], { encoding: 'utf8' });
        if (install.status !== 0) throw new Error(`설치에 실패했습니다: ${install.stderr}`);
      }
      if (profile !== 'baseline') {
        const style = profile === 'legacy'
          ? readFileSync(join(resolve(reference), '.claude/output-styles/korean-style.md'), 'utf8')
          : readFileSync(join(ROOT, 'output-styles/korean-style.md'), 'utf8');
        hashes[profile] = createHash('sha256').update(style).digest('hex');
        mkdirSync(join(cwd, '.claude/output-styles'), { recursive: true });
        writeFileSync(join(cwd, '.claude/output-styles/korean-style.md'), style);
        if (!withHooks || profile !== 'installed') writeFileSync(join(cwd, '.claude/settings.json'), JSON.stringify({ outputStyle: 'korean-style' }));
        writeFileSync(join(out, `${profile}-style.md`), style);
      }
      for (const model of models) for (let run = 1; run <= repeat; run++) for (const group of individual ? cases.map(c => [c]) : [cases]) {
        const prompt = individual ? group[0].prompt : batchPrompt;
        const started = Date.now();
        const liveHooks = withHooks && profile === 'installed';
        /* --with-hooks를 주면 모든 프로필의 프로젝트에서 Skill, Read, Bash 도구를 켜고 검사기 명령을 허용합니다. skill과 검사기는 이 도구를 설치한 프로젝트에만 있습니다. */
        const tools = withHooks
          ? ['--tools', 'Skill,Read,Bash', '--allowedTools', 'Bash(node .korean-style/scripts/check-korean.mjs:*)']
          : ['--tools', '', '--disable-slash-commands'];
        const call = spawnSync('claude', ['-p', '--model', model, '--effort', effort, '--output-format', withHooks ? 'stream-json' : 'json',
          ...(withHooks ? ['--verbose', '--include-hook-events'] : []), ...tools,
          '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'project',
          '--settings', JSON.stringify({ disableAllHooks: !liveHooks }), '--no-session-persistence'],
        { cwd, input: prompt, encoding: 'utf8', timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
        const file = `${profile}-${model}-${run}${individual ? '-' + group[0].id : ''}`.replace(/[^\w.-]/g, '_');
        writeFileSync(join(out, `${file}.${withHooks ? 'jsonl' : 'json'}`), call.stdout || '{}');
        if (call.error || call.status !== 0) throw new Error(`${file}: ${call.error?.message || call.stderr || call.stdout}`);
        const events = withHooks ? call.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
        const response = withHooks ? events.findLast(e => e.type === 'result') : JSON.parse(call.stdout);
        const skills = events.flatMap(e => e.type === 'assistant' ? (e.message?.content ?? []) : [])
          .filter(part => part.type === 'tool_use' && part.name === 'Skill').map(part => part.input?.skill ?? part.input?.command);
        if (!response) throw new Error(`${file}: 결과가 없습니다`);
        if (response.is_error || typeof response.result !== 'string') throw new Error(`${file}: ${JSON.stringify(response)}`);
        const parsed = individual ? [{ id: group[0].id, text: response.result.trim() }] : answersOf(response.result, cases);
        const answers = parsed.map((a, i) => assessAnswer(a, group[i]));
        if (!Object.keys(response.modelUsage ?? {}).includes(model)) throw new Error(`modelUsage에 요청한 모델이 없습니다: ${JSON.stringify(response.modelUsage)}`);
        const usage = response.usage ?? {};
        const row = { profile, model, run, actualModels: Object.keys(response.modelUsage ?? {}),
          seconds: (Date.now() - started) / 1000, apiMs: response.duration_api_ms,
          inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
          outputTokens: usage.output_tokens, costUsd: response.total_cost_usd, turns: response.num_turns,
          hooks: liveHooks, skills, hookResponses: events.filter(e => e.subtype === 'hook_response').map(e => ({ event: e.hook_event, output: e.stdout, exitCode: e.exit_code })), answers };
        results.push(row);
        writeFileSync(join(out, 'results.json'), JSON.stringify({ cli: cli.stdout.trim(), date: new Date().toISOString(),
          casesHash: createHash('sha256').update(JSON.stringify(cases)).digest('hex'), hashes, effort, batch: !individual, hooks: withHooks, results }, null, 2) + '\n');
        console.log(`${file}: ${row.seconds.toFixed(1)}초, 입력 토큰 ${row.inputTokens}, 출력 토큰 ${row.outputTokens}, 제약을 지킨 답변 ${answers.filter(a => !a.missing.length && !a.forbidden.length && !a.overLength && !a.wrongSentenceCount && !a.metaComment).length}/${group.length}`);
      }
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  console.log(`${out}/results.json에 저장했습니다. 답변마다 요청과 나란히 놓고 검토하십시오.`);
}

if (isEntryPoint(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
