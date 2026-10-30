#!/usr/bin/env node
/* 이 hook은 Claude가 요청을 마칠 때와 subagent가 끝날 때 백그라운드에서 실행됩니다. 그 요청에서 Claude가 쓴 한국어나 subagent가 쓴 한국어를 검토 모델에게 보냅니다. 파일, 커밋 메시지, PR과 이슈 글에 고칠 표현이 있으면 hook이 종료 코드 2로 끝나고 Claude Code가 Claude를 깨워 지적을 전합니다. */
import { readFileSync } from 'node:fs';
import { blockingViolations, checkText } from '../lib/check.mjs';
import { isEntryPoint, projectRoot, rulesDocPath } from '../lib/paths.mjs';
import { collectPieces, loadReviewed, reviewInput, reviewMessage, runReviewer, saveAnswerIssues, saveReviewed, splitIssues } from '../lib/review.mjs';
import { loadRules } from '../lib/rules.mjs';
import { agentTranscriptPath, currentTurn, lastUserPrompt } from '../lib/skill.mjs';

const PROJECT_ROOT = projectRoot();

/* subagent의 transcript에서 항목을 모두 읽어 돌려줍니다. 읽지 못하면 null을 돌려줍니다. */
export function allEntries(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  const entries = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* 쓰는 중인 마지막 줄은 건너뜁니다. */
    }
  }
  return entries;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function run() {
  if (process.env.KOREAN_STYLE_REVIEWING === '1') process.exit(0);
  let input;
  try {
    input = JSON.parse(readStdin());
  } catch {
    process.exit(0);
  }
  /* 검토 알림을 받고 깨어나 고친 뒤의 Stop에서는 다시 검토하지 않습니다. */
  if (input.stop_hook_active === true) process.exit(0);

  const rules = loadRules(rulesDocPath(PROJECT_ROOT));
  if (typeof rules.reviewerModel !== 'string' || rules.reviewerModel.length === 0) process.exit(0);

  let entries;
  let key;
  let answer = null;
  let prompt = '';
  if (input.hook_event_name === 'SubagentStop') {
    const path = typeof input.agent_transcript_path === 'string'
      ? input.agent_transcript_path : agentTranscriptPath(input.transcript_path, input.agent_id);
    entries = path === null ? null : allEntries(path);
    key = `${input.session_id}-${input.agent_id}`;
  } else {
    entries = currentTurn(input.transcript_path ?? '');
    key = input.session_id;
    prompt = lastUserPrompt(input.transcript_path ?? '');
    answer = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : '';
    /* 답변에 검사기가 막는 오류가 있으면 Stop hook이 답변을 다시 쓰게 합니다. 그래서 이 답변은 검토에서 뺍니다. */
    if (answer.length > 0 && blockingViolations(checkText(answer, rules, 'chat')).length > 0) answer = null;
  }
  if (entries === null || typeof input.session_id !== 'string') process.exit(0);

  const reviewed = loadReviewed(key);
  const { pieces, ids, hangul } = collectPieces(entries, { projectRoot: PROJECT_ROOT, rules, answer, reviewed, prompt });
  /* 검토 모델 호출이 실패해도 같은 글을 다시 보내지 않도록 호출하기 전에 검토한 항목을 저장합니다. */
  saveReviewed(key, [...reviewed, ...ids]);
  if (pieces.length === 0 || hangul < rules.reviewerMinHangul) process.exit(0);

  const verdict = runReviewer(reviewInput(pieces), { model: rules.reviewerModel, timeoutSeconds: rules.reviewerTimeout });
  if (verdict === null || verdict.ok) process.exit(0);
  /* 답변에 대한 지적은 저장해 두기만 합니다. 파일, 커밋 메시지, PR과 이슈 글에 대한 지적이 있을 때만 종료 코드 2로 끝나 Claude를 깨웁니다. */
  const { answer: answerIssues, work } = splitIssues(verdict.issues, pieces);
  if (answerIssues.length > 0) saveAnswerIssues(input.session_id, answerIssues);
  if (work.length === 0) process.exit(0);
  process.stderr.write(reviewMessage(work, rules.reviewerModel));
  process.exit(2);
}

/* 직접 실행할 때만 동작합니다. */
if (isEntryPoint(import.meta.url)) {
  try {
    run();
  } catch {
    /* 예외가 나면 알림 없이 끝냅니다. */
    process.exit(0);
  }
}
