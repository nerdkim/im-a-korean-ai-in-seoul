#!/usr/bin/env node
// Paid, opt-in comparison. Tools and skills are disabled; hooks are opt-in.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isEntryPoint } from './lib/paths.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function answersOf(text, cases) {
  return cases.map(({ id }) => {
    const matches = [...text.matchAll(new RegExp(`<answer id="${id}">([\\s\\S]*?)</answer>`, 'g'))];
    if (matches.length !== 1) throw new Error(`Missing answer or duplicate: ${id}`);
    return { id, text: matches[0][1].trim() };
  });
}

export function assessAnswer(answer, task) {
  const sentences = (answer.text.match(/[.!?](?=\s|$)/g) ?? []).length || (answer.text.trim() ? 1 : 0);
  return { ...answer, chars: [...answer.text].length, sentences,
    missing: [...task.must.filter(term => !answer.text.toLowerCase().includes(term.toLowerCase())),
      ...(task.mustAny ?? []).filter(group => !group.some(term => answer.text.includes(term))).map(group => group.join(' / '))],
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
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value: ${key}`);
    return args[i + 1];
  };
  if (args.includes('--self-check')) {
    if (answersOf('<answer id="a">ok</answer>', [{ id: 'a' }])[0].text !== 'ok') throw new Error('Parser failed');
    console.log('eval self-check passed (no API calls)');
    return;
  }
  if (!args.includes('--run')) {
    console.log('Usage: npm run eval -- --run [--models claude-sonnet-5,claude-opus-5] [--profiles baseline,installed] [--reference DIR] [--out DIR] [--repeat 1] [--individual] [--cases FILE] [--effort low] [--with-hooks]');
    return;
  }
  const cases = JSON.parse(readFileSync(resolve(value('--cases', join(ROOT, 'test/fixtures/eval/cases.json'))), 'utf8'));
  if (!Array.isArray(cases) || !cases.length || cases.some(c => !/^[a-z][a-z0-9-]*$/.test(c.id) ||
      typeof c.prompt !== 'string' || !Array.isArray(c.must) || c.must.some(t => typeof t !== 'string') ||
      (c.mustAny !== undefined && (!Array.isArray(c.mustAny) || c.mustAny.some(g => !Array.isArray(g) ||
        !g.length || g.some(t => typeof t !== 'string')))) || !Number.isFinite(c.maxChars)) ||
      new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('Invalid cases');
  const individual = args.includes('--individual');
  const withHooks = args.includes('--with-hooks');
  const effort = value('--effort', 'low');
  if (!['low', 'medium', 'high'].includes(effort)) throw new Error('Invalid effort');
  const models = value('--models', 'claude-sonnet-5,claude-opus-5').split(',');
  const profiles = value('--profiles', 'baseline,installed').split(',');
  const reference = value('--reference', null);
  if (reference && !profiles.includes('legacy')) profiles.splice(1, 0, 'legacy');
  if (profiles.includes('legacy') && !reference) throw new Error('legacy requires --reference');
  if (profiles.some(p => !['baseline', 'installed', 'legacy'].includes(p))) throw new Error('Unknown profile');
  const repeat = Number(value('--repeat', '1'));
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('--repeat must be 1..10');
  const out = resolve(value('--out', '.eval/latest'));
  if (existsSync(join(out, 'results.json'))) throw new Error('Results already exist; choose a new --out');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'cases.json'), JSON.stringify(cases, null, 2) + '\n');
  const batchPrompt = '각 요청에 독립적으로 답하세요. 결과만 <answer id="ID">답변</answer> 형식으로 출력하세요. 다른 설명은 붙이지 마세요.\n' + cases.map(c => `${c.id}: ${c.prompt}`).join('\n');
  const results = [];
  const hashes = {};
  const cli = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (cli.status !== 0) throw new Error('claude CLI is unavailable');
  const scratch = mkdtempSync(join(tmpdir(), 'korean-bench-'));
  try {
    for (const profile of profiles) {
      const cwd = join(scratch, profile);
      mkdirSync(cwd);
      if (withHooks && profile === 'installed') {
        const install = spawnSync('node', [join(ROOT, 'scripts/install.mjs'), '--target', cwd], { encoding: 'utf8' });
        if (install.status !== 0) throw new Error(`Installation failed: ${install.stderr}`);
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
        const call = spawnSync('claude', ['-p', '--model', model, '--effort', effort, '--output-format', liveHooks ? 'stream-json' : 'json',
          ...(liveHooks ? ['--verbose', '--include-hook-events'] : []),
          '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'project',
          '--settings', JSON.stringify({ disableAllHooks: !liveHooks }), '--disable-slash-commands', '--no-session-persistence'],
        { cwd, input: prompt, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
        const file = `${profile}-${model}-${run}${individual ? '-' + group[0].id : ''}`.replace(/[^\w.-]/g, '_');
        writeFileSync(join(out, `${file}.${liveHooks ? 'jsonl' : 'json'}`), call.stdout || '{}');
        if (call.error || call.status !== 0) throw new Error(`${file}: ${call.error?.message || call.stderr || call.stdout}`);
        const events = liveHooks ? call.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
        const response = liveHooks ? events.findLast(e => e.type === 'result') : JSON.parse(call.stdout);
        if (!response) throw new Error(`${file}: missing result`);
        if (response.is_error || typeof response.result !== 'string') throw new Error(`${file}: ${JSON.stringify(response)}`);
        const parsed = individual ? [{ id: group[0].id, text: response.result.trim() }] : answersOf(response.result, cases);
        const answers = parsed.map((a, i) => assessAnswer(a, group[i]));
        if (!Object.keys(response.modelUsage ?? {}).includes(model)) throw new Error(`Unexpected model: ${JSON.stringify(response.modelUsage)}`);
        const usage = response.usage ?? {};
        const row = { profile, model, run, actualModels: Object.keys(response.modelUsage ?? {}),
          seconds: (Date.now() - started) / 1000, apiMs: response.duration_api_ms,
          inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
          outputTokens: usage.output_tokens, costUsd: response.total_cost_usd, turns: response.num_turns,
          hooks: liveHooks, hookResponses: events.filter(e => e.subtype === 'hook_response').map(e => ({ event: e.hook_event, output: e.stdout, exitCode: e.exit_code })), answers };
        results.push(row);
        writeFileSync(join(out, 'results.json'), JSON.stringify({ cli: cli.stdout.trim(), date: new Date().toISOString(),
          casesHash: createHash('sha256').update(JSON.stringify(cases)).digest('hex'), hashes, effort, batch: !individual, hooks: withHooks, results }, null, 2) + '\n');
        console.log(`${file}: ${row.seconds.toFixed(1)}s, in=${row.inputTokens}, out=${row.outputTokens}, constraints=${answers.filter(a => !a.missing.length && !a.overLength && !a.wrongSentenceCount && !a.metaComment).length}/${group.length}`);
      }
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  console.log(`Saved ${out}/results.json; review each response next to its source.`);
}

if (isEntryPoint(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
