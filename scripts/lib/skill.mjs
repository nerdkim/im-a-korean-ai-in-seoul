/* 한국어를 쓰는 turn마다 Claude가 규칙 문서에 적은 skill을 거쳤는지 확인합니다. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* skill을 부르지 않아 hook이 막을 때 넣는 문구입니다. 같은 turn에서 몇 번 막았는지 셀 때도 씁니다. */
export const SKILL_MISSING = 'skill을 부르지 않았습니다';

/* 같은 turn에서 이만큼 막았는데도 skill을 부르지 않으면 Skill 도구를 쓸 수 없는 환경으로 보고 더 막지 않습니다. */
export const MAX_SKILL_DENIALS = 2;

/* 글에 든 한글 음절 수입니다. */
export function hangulCount(text) {
  return typeof text === 'string' ? (text.match(/[가-힣]/gu) ?? []).length : 0;
}

/* 프로젝트에 이 skill이 설치되어 있는지 봅니다. */
export function skillInstalled(projectRoot, name) {
  return typeof name === 'string' && name.length > 0 && existsSync(join(projectRoot, '.claude', 'skills', name, 'SKILL.md'));
}

/* 사용자가 직접 보낸 메시지인지 봅니다. 도구 결과와 skill 본문은 Claude Code가 사용자 메시지로 넣은 줄이라 제외합니다. */
function isUserPrompt(entry) {
  if (entry?.type !== 'user' || entry.isMeta === true) return false;
  const content = entry.message?.content;
  return !(Array.isArray(content) && content.length > 0 && content.every((part) => part?.type === 'tool_result'));
}

/* transcript에서 이번 turn의 항목을 순서대로 돌려줍니다. 파일을 읽지 못하면 null을 돌려줍니다. */
export function currentTurn(transcriptPath) {
  let raw;
  try {
    raw = readFileSync(transcriptPath, 'utf-8');
  } catch {
    return null;
  }
  const lines = raw.split('\n');
  const entries = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (isUserPrompt(entry)) break;
    entries.push(entry);
  }
  return entries.reverse();
}

/* subagent가 도구를 부르면 hook은 메인 세션의 transcript 경로를 받으므로, subagent의 transcript 경로를 따로 만듭니다. */
export function agentTranscriptPath(transcriptPath, agentId) {
  if (typeof transcriptPath !== 'string' || !transcriptPath.endsWith('.jsonl')) return null;
  if (typeof agentId !== 'string' || !/^[\w-]+$/.test(agentId)) return null;
  return join(transcriptPath.slice(0, -'.jsonl'.length), 'subagents', `agent-${agentId}.jsonl`);
}

/* 이번 turn에서 이 이름의 skill을 불렀는지 봅니다. */
export function usedSkill(entries, name) {
  for (const entry of entries) {
    if (entry?.type !== 'assistant') continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type !== 'tool_use' || part.name !== 'Skill') continue;
      const called = String(part.input?.skill ?? part.input?.command ?? '').trim().replace(/^\//, '');
      if (called === name) return true;
    }
  }
  return false;
}

/* 이번 turn에서 skill을 부르지 않아 막힌 횟수입니다. */
export function skillDenials(entries) {
  let count = 0;
  for (const entry of entries) {
    if (entry?.type !== 'user') continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type !== 'tool_result') continue;
      const text = typeof part.content === 'string' ? part.content : JSON.stringify(part.content ?? '');
      if (text.includes(SKILL_MISSING)) count += 1;
    }
  }
  return count;
}

/*
 * 한국어를 쓰기 전에 skill을 불러야 하는지 판단합니다.
 * skill이 꺼져 있거나 설치되지 않았거나, 한글이 기준보다 적거나, transcript를 읽지 못하면 요구하지 않습니다.
 */
export function needsSkill({ text, rules, projectRoot, transcriptPath, agentId }) {
  const name = rules.writingSkill;
  if (!skillInstalled(projectRoot, name)) return false;
  if (hangulCount(text) < Math.max(1, rules.writingSkillMinHangul)) return false;
  const path = agentId ? agentTranscriptPath(transcriptPath, agentId) : transcriptPath;
  const entries = path === null ? null : currentTurn(path);
  if (entries === null) return false;
  if (usedSkill(entries, name)) return false;
  return skillDenials(entries) < MAX_SKILL_DENIALS;
}

/* skill을 부르라고 요구하는 문구입니다. */
export function skillRequest(name, retry) {
  return `이 turn에서 아직 ${name} ${SKILL_MISSING}. 한국어를 쓰기 전에 Skill 도구로 ${name} skill을 부르고, 그 절차대로 글을 다듬은 뒤 ${retry}`;
}
