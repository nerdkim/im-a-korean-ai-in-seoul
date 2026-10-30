#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEntryPoint } from './lib/paths.mjs';
import { callReviewer, parseVerdict, reviewInput } from './lib/review.mjs';
import { loadRules } from './lib/rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test/fixtures/eval/reviewer.json');
const DEFAULT_OUT = '.eval/reviewer/latest.json';

export function batchInput(batch) {
  return reviewInput(batch.pieces.map((piece) => ({
    label: piece.label,
    lines: piece.lines.map((line) => (line.no === undefined ? line.text : `${line.no}: ${line.text}`)),
  })));
}

export function attribute(batch, issue) {
  const lines = batch.pieces.flatMap((piece) => piece.lines.map((line, index) => ({ ...line, label: piece.label, index })));
  const quoted = issue.text.trim();
  const where = issue.where;
  const number = Number(where.match(/(\d+)/)?.[1]);
  const byText = quoted.length > 0 ? lines.filter((line) => line.text.includes(quoted)) : [];
  if (byText.length === 1) return byText[0].id;
  const pool = byText.length > 1 ? byText : lines;
  const inPiece = pool.filter((line) => where.includes(line.label));
  const byNumber = inPiece.filter((line) => (line.no === undefined ? line.index + 1 === number : line.no === number));
  if (byNumber.length === 1) return byNumber[0].id;
  if (inPiece.length === 1) return inPiece[0].id;
  return null;
}

export function summarizeReviewer(fixture, runs) {
  const items = new Map();
  for (const batch of fixture.batches) {
    for (const piece of batch.pieces) {
      for (const line of piece.lines) items.set(line.id, { kind: line.kind, batch: batch.id, judged: 0, flagged: 0 });
    }
  }
  let failed = 0;
  let unknown = 0;
  let cost = 0;
  const api = [];
  for (const run of runs) {
    if (!run.parsed) {
      failed += 1;
      continue;
    }
    cost += run.cost;
    api.push(run.apiMs);
    unknown += run.unknown;
    for (const [id, item] of items) {
      if (item.batch !== run.batch) continue;
      item.judged += 1;
      if (run.flagged.includes(id)) item.flagged += 1;
    }
  }
  const total = (kind, field) => [...items.values()].filter((item) => item.kind === kind).reduce((sum, item) => sum + item[field], 0);
  api.sort((a, b) => a - b);
  const counted = runs.length - failed;
  return {
    english: { flagged: total('english', 'flagged'), judged: total('english', 'judged') },
    natural: { flagged: total('natural', 'flagged'), judged: total('natural', 'judged') },
    items: Object.fromEntries([...items].map(([id, item]) => [id, { kind: item.kind, flagged: item.flagged, judged: item.judged }])),
    calls: runs.length,
    failed,
    unknown,
    costPerCall: counted > 0 ? cost / counted : 0,
    apiMedianSeconds: api.length > 0 ? api[Math.floor(api.length / 2)] / 1000 : 0,
  };
}

export function formatReviewerSummary(summary, meta = {}) {
  const lines = [];
  if (meta.model) lines.push(`검토 모델 ${meta.model}에게 묶음을 ${summary.calls}번 보냈습니다. 답을 읽지 못한 경우는 ${summary.failed}번입니다.`);
  const caught = summary.english.flagged === 0 ? '한 번도 지적하지 못했습니다' : `그 가운데 ${summary.english.flagged}번을 지적했습니다`;
  const wrong = summary.natural.flagged === 0 ? '한 번도 잘못 지적하지 않았습니다' : `그 가운데 ${summary.natural.flagged}번을 잘못 지적했습니다`;
  lines.push(`영어식 표현이 든 문장을 ${summary.english.judged}번 보냈고 검토 모델은 ${caught}.`);
  lines.push(`자연스러운 문장을 ${summary.natural.judged}번 보냈고 검토 모델은 ${wrong}.`);
  lines.push(`어느 문장을 가리키는지 알 수 없는 지적은 ${summary.unknown}개입니다.`);
  lines.push(`묶음 하나에 든 비용은 평균 ${summary.costPerCall.toFixed(4)}달러이고 묶음 하나에 답하는 데 걸린 시간의 중앙값은 ${summary.apiMedianSeconds.toFixed(1)}초입니다.`);
  lines.push('문장마다 지적한 횟수는 다음과 같습니다.');
  for (const [id, item] of Object.entries(summary.items)) lines.push(`- ${id} (${item.kind}): ${item.judged}번 가운데 ${item.flagged}번`);
  return lines.join('\n');
}

function valueOf(args, key, fallback) {
  const at = args.indexOf(key);
  if (at === -1) return fallback;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${key} 다음에 값이 필요합니다`);
  return value;
}

export function main(args) {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf-8'));
  if (args.includes('--self-check')) {
    const screen = fixture.batches.find((batch) => batch.id === 'screen');
    const id = attribute(screen, { where: 'src/JournalView.tsx 12', text: '앞선 항목', fix: '이전 항목' });
    const summary = summarizeReviewer(fixture, [{ batch: 'screen', parsed: true, flagged: [id], unknown: 0, cost: 0, apiMs: 0 }]);
    if (id !== 'source-1' || summary.english.flagged !== 1) throw new Error('지적을 예문에 연결하지 못했습니다');
    console.log('검토 모델 평가의 자체 검사를 통과했습니다. API는 호출하지 않았습니다.');
    return;
  }
  if (args.includes('--summary')) {
    const after = args[args.indexOf('--summary') + 1];
    const file = resolve(after !== undefined && !after.startsWith('--') ? after : DEFAULT_OUT);
    const saved = JSON.parse(readFileSync(file, 'utf-8'));
    console.log(formatReviewerSummary(summarizeReviewer(fixture, saved.runs), saved));
    return;
  }
  if (!args.includes('--run')) {
    console.log('사용법: npm run eval -- --reviewer --run [--model opus] [--repeat 3] [--out .eval/reviewer/latest.json]');
    console.log('       npm run eval -- --reviewer --summary [결과 파일]');
    return;
  }
  const rules = loadRules(join(ROOT, 'docs/rules.md'));
  const model = valueOf(args, '--model', rules.reviewerModel);
  const repeat = Number(valueOf(args, '--repeat', '3'));
  const out = resolve(valueOf(args, '--out', DEFAULT_OUT));
  const version = spawnSync('claude', ['--version'], { encoding: 'utf-8' }).stdout?.trim() ?? '';
  const runs = [];
  for (let round = 0; round < repeat; round += 1) {
    for (const batch of fixture.batches) {
      const outer = callReviewer(batchInput(batch), { model, timeoutSeconds: 180 });
      const verdict = outer === null ? null : parseVerdict(outer.result);
      const flagged = new Set();
      let unknown = 0;
      for (const issue of verdict?.issues ?? []) {
        const id = attribute(batch, issue);
        if (id === null) unknown += 1;
        else flagged.add(id);
      }
      runs.push({
        batch: batch.id,
        parsed: verdict !== null,
        flagged: [...flagged],
        unknown,
        cost: outer?.total_cost_usd ?? 0,
        apiMs: outer?.duration_api_ms ?? 0,
        result: outer?.result ?? null,
      });
      console.error(`${round + 1}회차 ${batch.id}: 지적 ${flagged.size}개`);
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  const saved = { model, repeat, claudeVersion: version, date: new Date().toISOString(), runs };
  writeFileSync(out, `${JSON.stringify(saved, null, 2)}\n`);
  console.log(formatReviewerSummary(summarizeReviewer(fixture, runs), saved));
  console.log(`결과를 ${out}에 저장했습니다.`);
}

if (isEntryPoint(import.meta.url)) main(process.argv.slice(2));
