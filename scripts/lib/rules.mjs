/* 규칙을 읽어 옵니다. */
import { readFileSync } from 'node:fs';

/* 규칙 블록 fence의 info string입니다. */
export const RULE_FENCE = 'korean-style-rules';

/* 값이 여러 개인 키입니다. */
const LIST_KEYS = {
  'advisory-rules': 'advisoryRules',
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
  /* 직역 동사 규칙이 건드리지 않을 영어 목적어입니다. */
  'literal-verb-exempt': 'literalVerbExempt',
};

/* 금지형과 권장형을 짝지은 매핑 키입니다. */
const MAP_KEYS = {
  /* 이중피동은 매핑으로 씁니다. */
  'double-passive': 'doublePassive',
  'banned-transliteration': 'bannedTransliteration',
  'banned-translation': 'bannedTranslation',
  'required-spelling': 'requiredSpelling',
  'loanword-spelling': 'loanwordSpelling',
  'literal-verbs': 'literalVerbs',
  'translationese-patterns': 'translationesePatterns',
  'known-typos': 'knownTypos',
  'inclusive-terms': 'inclusiveTerms',
};

/* 숫자 하나인 키입니다. */
const NUMBER_KEYS = {
  'korean-required-min-chars': 'koreanRequiredMinChars',
  'max-comma-per-sentence': 'maxCommaPerSentence',
  'max-comma-segment-words': 'maxCommaSegmentWords',
  'enumeration-word-max': 'enumerationWordMax',
  /* 문장 단위 규칙 세 개가 한국어 문장으로 인정하는 최소 한글 비율입니다. */
  'sentence-min-hangul-ratio': 'sentenceMinHangulRatio',
  /* 절로 인정하는 최소 어절 수입니다. */
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
  /* 밀도 규칙이 한도에 더해 허용하는 여유입니다. */
  'density-margin': 'densityMargin',
};

/* 언어마다 숫자를 따로 두는 키입니다. */
const KEYED_NUMBER_KEYS = {
  'max-contrast-per-1k': 'maxContrastPer1k',
};

/* 값이 문자열 하나인 키입니다. */
const STRING_KEYS = {
  register: 'register',
};

/* 도구 입력 필드를 지정하는 키입니다. */
const TOOL_FIELD_KEYS = {
  'chat-tool-fields': 'chatToolFields',
  'agent-tool-fields': 'agentToolFields',
};

/* 어투별 금지 어미 표입니다. */
export const REGISTER_BANNED_ENDINGS = {
  다나까체: ['세요', '셔요', '에요', '예요', '아요', '어요', '해요'],
  /* 해요체를 골랐으면 다나까체 표지가 섞이지 않아야 합니다. */
  해요체: ['니다'],
  혼용: [],
};

/* 어투만 바꾼 규칙 사본을 돌려줍니다. */
export function withRegister(rules, register) {
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
  register: '다나까체',
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
  bannedTransliteration: new Map(),
  bannedTranslation: new Map(),
  requiredSpelling: new Map(),
  loanwordSpelling: new Map(),
  literalVerbs: new Map(),
  translationesePatterns: new Map(),
  knownTypos: new Map(),
  inclusiveTerms: new Map(),
  chatToolFields: new Map(),
  agentToolFields: new Map(),
  maxContrastPer1k: {},
  /* 0은 규칙을 끕니다. */
  koreanRequiredMinChars: 40,
  maxCommaPerSentence: 0,
  maxCommaSegmentWords: 0,
  /* 나열 항목 하나에 허용하는 최대 어절 수입니다. */
  enumerationWordMax: 3,
  /* 문장 단위 규칙 세 개가 한국어 문장으로 인정하는 최소 한글 비율입니다. */
  sentenceMinHangulRatio: 0,
  /* 절로 인정하는 최소 어절 수입니다. */
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
};

/* 목록과 표를 새로 만들어 돌려줍니다. */
function freshRules() {
  return {
    ...FALLBACK,
    advisoryRules: [],
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
    bannedTransliteration: new Map(),
    bannedTranslation: new Map(),
    requiredSpelling: new Map(),
    loanwordSpelling: new Map(),
    literalVerbs: new Map(),
    translationesePatterns: new Map(),
    knownTypos: new Map(),
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
      if (values[0] !== undefined) rules[STRING_KEYS[key]] = values[0];
      continue;
    }
    if (LIST_KEYS[key] !== undefined) {
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

  /* 어투에 맞는 금지 어미를 더합니다. */
  for (const ending of REGISTER_BANNED_ENDINGS[rules.register] ?? []) {
    if (!rules.bannedRegisterEndings.includes(ending)) rules.bannedRegisterEndings.push(ending);
  }

  return withMinimum(rules);
}

/* 비어 있는 목록을 기본값으로 채웁니다. */
function withMinimum(rules) {
  if (rules.bannedChar.length === 0) rules.bannedChar = [...FALLBACK.bannedChar];
  if (rules.bannedAddress.length === 0) rules.bannedAddress = [...FALLBACK.bannedAddress];
  if (rules.sweepSkipDirs.length === 0) rules.sweepSkipDirs = [...FALLBACK.sweepSkipDirs];
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

/* fence 안쪽을 다시 볼 때 쓰는 규칙입니다. */
export function fenceRules(rules) {
  return {
    ...rules,
    bannedChar: rules.bannedChar.filter((name) => name !== 'emoji'),
    imperativeEndings: [],
    needsGloss: [],
    negationPrefixes: [],
    conjunctiveAdverbs: [],
    connectiveEndings: [],
    demonstratives: [],
    nominalizationEndings: [],
    doublePassive: new Map(),
    flatteryOpeners: [],
    translationesePatterns: new Map(),
    literalVerbs: new Map(),
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
