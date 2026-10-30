/* 규칙을 읽어 옵니다. */
import { readFileSync } from 'node:fs';

/* 규칙 블록을 여는 줄에 쓰는 info string입니다. */
export const RULE_FENCE = 'korean-style-rules';

/* 값이 여러 개인 키입니다. */
const LIST_KEYS = {
  'advisory-rules': 'advisoryRules',
  /* hook이 Claude에게 알릴 경고 규칙입니다. Claude가 파일을 쓰거나 고칠 때 바뀐 문단에서 이 규칙에 걸리는 표현이 새로 생기면 hook이 알립니다. */
  'review-rules': 'reviewRules',
  'banned-char': 'bannedChar',
  'banned-address': 'bannedAddress',
  'imperative-endings': 'imperativeEndings',
  'imperative-exempt': 'imperativeExempt',
  'banned-register-endings': 'bannedRegisterEndings',
  'conjunctive-adverbs': 'conjunctiveAdverbs',
  'connective-endings': 'connectiveEndings',
  /* 종결어미입니다. */
  'final-endings': 'finalEndings',
  'flattery-openers': 'flatteryOpeners',
  'nominalization-endings': 'nominalizationEndings',
  demonstratives: 'demonstratives',
  'needs-gloss': 'needsGloss',
  'negation-prefixes': 'negationPrefixes',
  'allowed-emoji-shortcode': 'allowedEmojiShortcodes',
  'doc-globs': 'docGlobs',
  'source-globs': 'sourceGlobs',
  'skip-globs': 'skipGlobs',
  'sweep-skip-dirs': 'sweepSkipDirs',
  'plural-quantifiers': 'pluralQuantifiers',
  /* 직역 동사 규칙에서 예외로 두는 영어 목적어입니다. */
  'literal-verb-exempt': 'literalVerbExempt',
  /* Claude Code가 커밋 메시지와 PR 설명에 붙이는 생성 표시입니다. */
  'banned-attribution': 'bannedAttribution',
};

/* 찾을 표현과 대신 쓸 후보를 짝지은 매핑 키입니다. */
const MAP_KEYS = {
  /* 이중피동도 `보여=보이`처럼 찾을 어간과 대신 쓸 어간을 짝지어 적습니다. */
  'double-passive': 'doublePassive',
  'banned-transliteration': 'bannedTransliteration',
  'banned-translation': 'bannedTranslation',
  'required-spelling': 'requiredSpelling',
  'loanword-spelling': 'loanwordSpelling',
  'literal-verbs': 'literalVerbs',
  /* 정해 둔 낱말이 목적어일 때만 잡는 직역 동사입니다. 예전 검사기가 이 항목을 낱말 목록으로 잘못 읽지 않도록 `literal-verbs`와 다른 키에 둡니다. */
  'object-verbs': 'objectVerbs',
  'translationese-patterns': 'translationesePatterns',
  'known-typos': 'knownTypos',
  /* 영어를 낱말 단위로 옮겨 만든 말과 대신 쓸 표현입니다. */
  calques: 'calques',
  'inclusive-terms': 'inclusiveTerms',
};

/* 값이 숫자 하나인 키입니다. */
const NUMBER_KEYS = {
  'korean-required-min-chars': 'koreanRequiredMinChars',
  'max-comma-per-sentence': 'maxCommaPerSentence',
  'max-comma-segment-words': 'maxCommaSegmentWords',
  'enumeration-word-max': 'enumerationWordMax',
  /* 쉼표 수, 쉼표 구간 길이, 긴 문장 규칙에서 한국어 문장으로 볼 최소 한글 비율입니다. */
  'sentence-min-hangul-ratio': 'sentenceMinHangulRatio',
  /* 절로 볼 최소 어절 수입니다. */
  'clause-min-words': 'clauseMinWords',
  'max-connective-comma-per-1k': 'maxConnectiveCommaPer1k',
  'max-sentence-chars': 'maxSentenceChars',
  'max-bound-english-per-sentence': 'maxBoundEnglishPerSentence',
  'max-repeated-english-gloss': 'maxRepeatedEnglishGloss',
  'max-bold-per-unit': 'maxBoldPerUnit',
  'max-demonstrative-per-1k': 'maxDemonstrativePer1k',
  'max-nominalization-per-1k': 'maxNominalizationPer1k',
  'max-suffix-jeok-per-1k': 'maxSuffixJeokPer1k',
  'max-particle-ui-per-1k': 'maxParticleUiPer1k',
  'density-rule-floor': 'densityRuleFloor',
  /* 밀도 규칙의 한도에 더하는 여유입니다. */
  'density-margin': 'densityMargin',
  /* 한글이 이 수 이상 들어간 글을 쓰기 전에 Claude는 `writing-skill`에 적힌 skill을 불러야 합니다. */
  'writing-skill-min-hangul': 'writingSkillMinHangul',
  /* 한글이 이 수 이상 들어간 파일 내용, 커밋 메시지, PR과 이슈에 올리는 글은 `writer-agent`에 적힌 agent가 써야 합니다. */
  'writer-agent-min-hangul': 'writerAgentMinHangul',
  /* 한글이 이 수 이상 들어간 답변도 `writer-agent`에 적힌 agent가 써야 합니다. 0이면 답변에는 요구하지 않습니다. */
  'writer-agent-answer-min-hangul': 'writerAgentAnswerMinHangul',
  /* 요청에서 쓴 한국어에 한글이 이 수 이상 들어 있어야 검토 모델에게 보냅니다. */
  'reviewer-min-hangul': 'reviewerMinHangul',
  /* 답변은 한글이 이 수 이상일 때만 검토 모델에게 보냅니다. 0이면 답변은 보내지 않습니다. */
  'reviewer-answer-min-hangul': 'reviewerAnswerMinHangul',
  /* 검토 모델에게 한 번에 보내는 한글의 상한입니다. */
  'reviewer-max-hangul': 'reviewerMaxHangul',
  /* 검토 모델의 답을 기다리는 시간(초)입니다. */
  'reviewer-timeout': 'reviewerTimeout',
};

/* 언어마다 숫자를 따로 두는 키입니다. */
const KEYED_NUMBER_KEYS = {
  'max-contrast-per-1k': 'maxContrastPer1k',
};

/* 값이 문자열 하나인 키입니다. */
const STRING_KEYS = {
  register: 'register',
  /* 한국어를 쓰는 요청마다 불러야 하는 skill입니다. 비워 두면 요구하지 않습니다. */
  'writing-skill': 'writingSkill',
  /* 한글이 많은 글을 맡길 agent입니다. 비워 두면 요구하지 않습니다. */
  'writer-agent': 'writerAgent',
  /* Claude가 요청에서 쓴 한국어를 따로 읽게 할 검토 모델입니다. 비워 두면 검토하지 않습니다. */
  'reviewer-model': 'reviewerModel',
  /* 문서에서 `<!-- 이 값 -->` 줄과 `<!-- /이 값 -->` 줄 사이는 다른 글을 그대로 옮긴 인용으로 보고 검사하지 않습니다. */
  'quote-marker': 'quoteMarker',
};

/* 도구 입력 필드를 지정하는 키입니다. */
const TOOL_FIELD_KEYS = {
  'chat-tool-fields': 'chatToolFields',
  'agent-tool-fields': 'agentToolFields',
};

/* 말투별 금지 어미 표입니다. */
export const REGISTER_BANNED_ENDINGS = {
  합니다체: ['세요', '셔요', '에요', '예요', '아요', '어요', '해요'],
  /* 해요체를 골랐으면 합니다체 어미가 섞이지 않아야 합니다. */
  해요체: ['니다'],
  혼용: [],
};

/* Claude Code가 커밋 메시지와 PR 설명에 붙이는 생성 표시입니다. `banned-attribution` 키가 없는 예전 규칙을 쓰거나 규칙 문서를 읽지 못했을 때도 이 목록으로 검사합니다. */
export const DEFAULT_ATTRIBUTION = ['Generated with [Claude Code]', 'Generated with Claude Code', 'noreply@anthropic.com'];

/* 같은 말투를 가리키는 다른 이름입니다. 이 도구는 0.3.0까지 합니다체를 `다나까체`라고 불렀습니다. 국립국어원 문법 용어로는 하십시오체라고 합니다. */
export const REGISTER_ALIASES = { 다나까체: '합니다체', 하십시오체: '합니다체' };

/* 말투 이름을 이 도구가 쓰는 이름으로 바꿉니다. 모르는 이름은 그대로 돌려줍니다. */
export function canonicalRegister(name) {
  return Object.hasOwn(REGISTER_ALIASES, name) ? REGISTER_ALIASES[name] : name;
}

/* 말투만 바꾼 규칙 사본을 돌려줍니다. */
export function withRegister(rules, name) {
  const register = canonicalRegister(name);
  if (register === rules.register) return rules;
  const fromTable = new Set(REGISTER_BANNED_ENDINGS[rules.register] ?? []);
  const endings = rules.bannedRegisterEndings.filter((ending) => !fromTable.has(ending));
  for (const ending of REGISTER_BANNED_ENDINGS[register] ?? []) {
    if (!endings.includes(ending)) endings.push(ending);
  }
  return { ...rules, register, bannedRegisterEndings: endings };
}

const FALLBACK = {
  advisoryRules: [],
  reviewRules: [],
  register: '합니다체',
  bannedChar: ['middot', 'em-dash', 'emoji', 'hanja', 'kana'],
  bannedAddress: ['당신'],
  imperativeEndings: [],
  imperativeExempt: [],
  bannedRegisterEndings: [],
  conjunctiveAdverbs: [],
  connectiveEndings: [],
  finalEndings: [],
  doublePassive: new Map(),
  flatteryOpeners: [],
  nominalizationEndings: [],
  demonstratives: [],
  needsGloss: [],
  negationPrefixes: [],
  allowedEmojiShortcodes: [],
  docGlobs: [],
  sourceGlobs: [],
  skipGlobs: [],
  sweepSkipDirs: ['.git', 'node_modules', 'dist', 'coverage', 'build', '.next', 'vendor'],
  pluralQuantifiers: [],
  literalVerbExempt: [],
  bannedAttribution: DEFAULT_ATTRIBUTION,
  bannedTransliteration: new Map(),
  bannedTranslation: new Map(),
  requiredSpelling: new Map(),
  loanwordSpelling: new Map(),
  literalVerbs: new Map(),
  objectVerbs: new Map(),
  translationesePatterns: new Map(),
  knownTypos: new Map(),
  calques: new Map(),
  inclusiveTerms: new Map(),
  chatToolFields: new Map(),
  agentToolFields: new Map(),
  maxContrastPer1k: {},
  /* 키가 없는 예전 규칙이나 읽지 못한 규칙에서도 기본 인용 표시를 씁니다. 끄려면 규칙 문서에서 값을 비웁니다. */
  quoteMarker: 'korean-style-quote',
  /* koreanRequiredMinChars와 max로 시작하는 한도는 0으로 두면 그 규칙이 꺼집니다. */
  koreanRequiredMinChars: 40,
  maxCommaPerSentence: 0,
  maxCommaSegmentWords: 0,
  /* 쉼표로 나눈 구간이 이 어절 수 이하여야 나열 항목으로 봅니다. */
  enumerationWordMax: 3,
  /* 쉼표 수, 쉼표 구간 길이, 긴 문장 규칙에서 한국어 문장으로 볼 최소 한글 비율입니다. */
  sentenceMinHangulRatio: 0,
  /* 절로 볼 최소 어절 수입니다. */
  clauseMinWords: 2,
  maxConnectiveCommaPer1k: 0,
  maxSentenceChars: 0,
  maxBoundEnglishPerSentence: 0,
  maxRepeatedEnglishGloss: 0,
  maxBoldPerUnit: 0,
  maxDemonstrativePer1k: 0,
  maxNominalizationPer1k: 0,
  maxSuffixJeokPer1k: 0,
  maxParticleUiPer1k: 0,
  densityRuleFloor: 4,
  /* 여유의 기본값은 일부러 0으로 둡니다. */
  densityMargin: 0,
  /* `writing-skill` 키가 없는 예전 규칙에서도 `korean-rewrite` skill을 요구합니다. 끄려면 규칙 문서에서 값을 비웁니다. */
  writingSkill: 'korean-rewrite',
  writingSkillMinHangul: 20,
  /* `writer-agent` 키가 없는 예전 규칙에서도 이 agent가 설치되어 있으면 글을 맡기라고 요구합니다. */
  writerAgent: 'korean-writer',
  writerAgentMinHangul: 200,
  /* 답변까지 맡기면 작업하던 Claude가 메모와 돌려받은 글을 한 번씩 더 출력해야 하므로 기본값은 0입니다. */
  writerAgentAnswerMinHangul: 0,
  /* `reviewer-model` 키가 없는 예전 규칙에서도 검토합니다. 끄려면 규칙 문서에서 값을 비웁니다. */
  reviewerModel: 'sonnet',
  reviewerMinHangul: 10,
  reviewerAnswerMinHangul: 30,
  reviewerMaxHangul: 6000,
  reviewerTimeout: 90,
};

/* 목록과 표를 새로 만들어 돌려줍니다. */
function freshRules() {
  return {
    ...FALLBACK,
    advisoryRules: [],
    reviewRules: [],
    bannedChar: [],
    bannedAddress: [],
    imperativeEndings: [],
    imperativeExempt: [],
    bannedRegisterEndings: [],
    conjunctiveAdverbs: [],
    connectiveEndings: [],
    finalEndings: [],
    doublePassive: new Map(),
    flatteryOpeners: [],
    nominalizationEndings: [],
    demonstratives: [],
    needsGloss: [],
    negationPrefixes: [],
    allowedEmojiShortcodes: [],
    docGlobs: [],
    sourceGlobs: [],
    skipGlobs: [],
    sweepSkipDirs: [],
    pluralQuantifiers: [],
    literalVerbExempt: [],
    /* 키가 없으면 null로 남겨 두고 `withMinimum`에서 기본 목록으로 채웁니다. */
    bannedAttribution: null,
    bannedTransliteration: new Map(),
    bannedTranslation: new Map(),
    requiredSpelling: new Map(),
    loanwordSpelling: new Map(),
    literalVerbs: new Map(),
    objectVerbs: new Map(),
    translationesePatterns: new Map(),
    knownTypos: new Map(),
    calques: new Map(),
    inclusiveTerms: new Map(),
    chatToolFields: new Map(),
    agentToolFields: new Map(),
    maxContrastPer1k: {},
  };
}

function putMapping(map, values) {
  for (const pair of values) {
    const eq = pair.indexOf('=');
    if (eq <= 0) {
      const only = pair.trim();
      if (only.length > 0) map.set(only, '');
      continue;
    }
    map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

/* 규칙 블록을 해석합니다. */
export function parseRuleBlock(body) {
  const rules = freshRules();
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const m = /^([a-z][a-z0-9-]*)\s*:\s*(.*)$/.exec(line);
    if (m === null) continue;
    const key = m[1];
    const values = m[2]
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (STRING_KEYS[key] !== undefined) {
      /* `writing-skill:`이나 `writer-agent:`처럼 값을 비우면 요구하지 않고 `reviewer-model:`을 비우면 검토하지 않습니다. `quote-marker:`처럼 비우면 인용 구간을 두지 않습니다. */
      if (values[0] !== undefined || key === 'writing-skill' || key === 'writer-agent' || key === 'reviewer-model' || key === 'quote-marker') rules[STRING_KEYS[key]] = values[0] ?? '';
      continue;
    }
    if (LIST_KEYS[key] !== undefined) {
      /* `banned-attribution:`처럼 값을 비우면 빈 목록이 되어 검사가 꺼집니다. */
      rules[LIST_KEYS[key]] ??= [];
      rules[LIST_KEYS[key]].push(...values);
      continue;
    }
    if (MAP_KEYS[key] !== undefined) {
      putMapping(rules[MAP_KEYS[key]], values);
      continue;
    }
    if (NUMBER_KEYS[key] !== undefined) {
      const n = Number.parseFloat(values[0] ?? '');
      if (Number.isFinite(n)) rules[NUMBER_KEYS[key]] = n;
      continue;
    }
    if (KEYED_NUMBER_KEYS[key] !== undefined) {
      for (const pair of values) {
        const eq = pair.indexOf('=');
        if (eq <= 0) continue;
        const n = Number.parseFloat(pair.slice(eq + 1).trim());
        if (Number.isFinite(n)) rules[KEYED_NUMBER_KEYS[key]][pair.slice(0, eq).trim()] = n;
      }
      continue;
    }
    const toolFieldKey = TOOL_FIELD_KEYS[key];
    if (toolFieldKey !== undefined) {
      /* 각 항목은 `도구이름.필드이름` 꼴입니다. */
      for (const entry of values) {
        const dot = entry.indexOf('.');
        if (dot <= 0) continue;
        const tool = entry.slice(0, dot).trim();
        const field = entry.slice(dot + 1).trim();
        if (field.length === 0) continue;
        const set = rules[toolFieldKey].get(tool) ?? new Set();
        set.add(field);
        rules[toolFieldKey].set(tool, set);
      }
      continue;
    }
  }

  /* 예전 이름으로 적은 말투를 이 도구가 쓰는 이름으로 바꾸고 그 말투에 맞는 금지 어미를 추가합니다. */
  rules.register = canonicalRegister(rules.register);
  for (const ending of REGISTER_BANNED_ENDINGS[rules.register] ?? []) {
    if (!rules.bannedRegisterEndings.includes(ending)) rules.bannedRegisterEndings.push(ending);
  }

  return withMinimum(rules);
}

/* 금지 문자, 금지 호칭, 건너뛸 디렉터리 목록이 비어 있거나 생성 표시 키가 없으면 기본값으로 채웁니다. */
function withMinimum(rules) {
  if (rules.bannedChar.length === 0) rules.bannedChar = [...FALLBACK.bannedChar];
  if (rules.bannedAddress.length === 0) rules.bannedAddress = [...FALLBACK.bannedAddress];
  if (rules.sweepSkipDirs.length === 0) rules.sweepSkipDirs = [...FALLBACK.sweepSkipDirs];
  if (rules.bannedAttribution === null) rules.bannedAttribution = [...DEFAULT_ATTRIBUTION];
  return rules;
}

/* 규칙 문서를 읽습니다. */
export function loadRules(docPath) {
  let src;
  try {
    src = readFileSync(docPath, 'utf-8');
  } catch {
    return { ...withMinimum(freshRules()), source: null, reason: `규칙 문서(${docPath})를 열지 못했습니다.` };
  }
  const block = new RegExp('```' + RULE_FENCE + '\\n([\\s\\S]*?)```').exec(src);
  if (block === null) {
    return { ...withMinimum(freshRules()), source: null, reason: `${docPath}에 ${RULE_FENCE} 블록이 없습니다.` };
  }
  return { ...parseRuleBlock(block[1]), source: docPath, reason: null };
}

/* 코드 블록 안쪽을 다시 볼 때 쓰는 규칙입니다. */
export function fenceRules(rules) {
  return {
    ...rules,
    bannedChar: rules.bannedChar.filter((name) => name !== 'emoji'),
    imperativeEndings: [],
    needsGloss: [],
    negationPrefixes: [],
    calques: new Map(),
    conjunctiveAdverbs: [],
    connectiveEndings: [],
    demonstratives: [],
    nominalizationEndings: [],
    doublePassive: new Map(),
    flatteryOpeners: [],
    translationesePatterns: new Map(),
    literalVerbs: new Map(),
    objectVerbs: new Map(),
    maxCommaPerSentence: 0,
    maxCommaSegmentWords: 0,
    maxConnectiveCommaPer1k: 0,
    maxSentenceChars: 0,
    maxBoundEnglishPerSentence: 0,
    maxRepeatedEnglishGloss: 0,
    maxBoldPerUnit: 0,
    maxDemonstrativePer1k: 0,
    maxNominalizationPer1k: 0,
    maxSuffixJeokPer1k: 0,
    maxParticleUiPer1k: 0,
    maxContrastPer1k: {},
    koreanRequiredMinChars: 0,
  };
}
