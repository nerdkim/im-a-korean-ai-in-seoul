# 검사 규칙

이 문서의 `korean-style-rules` 블록이 검사기의 설정 원본입니다.
생성 지침은 `output-styles/korean-style.md`에 있습니다. 모델은 응답할 때마다 두 파일을 다시 읽지 않습니다.

## 판정

- 오류는 hook에서 차단합니다. 오류로 분류한 규칙은 어투와 표기처럼 프로젝트가 정한 정책입니다.
- 기본값에서는 산문에 쓴 middle dot(U+00B7), em-dash(U+2014) 등 `banned-char`에 든 문자를 오류로 막습니다. 나열은 쉼표나 조사로 잇고 부연은 괄호나 별도 문장으로 씁니다.
- `advisory-rules`에 든 규칙에 걸리면 경고로만 보고합니다. CLI에서 보여 주되 hook에서 재작성을 요구하지 않습니다.
- CLI는 오류가 있으면 1, 사용법이 틀리면 2를 반환합니다. 경고만 있으면 0이며 `--strict`에서는 1입니다.
- CLI는 규칙을 읽지 못하면 실패합니다. hook은 규칙을 읽지 못해도 멈추지 않고 기본 최소 규칙으로 검사합니다. 고장은 `doctor`와 `gate`로 확인합니다.

## 일부 규칙을 경고로 바꾸고 영어 제한을 푼 근거

교정은 원문의 의미를 보존해야 합니다. 검사 규칙은 자연스러운 표현을 바꾸거나 원문에 없는 사실을 덧붙이도록 강제하지 않습니다.

`문을 통해 들어갑니다`, `책을 가지고 있습니다`, `예전에는 서울에 살았었습니다`는 문맥에 맞는 표현입니다.
`translationese`는 이 문장들도 잡습니다. `디스크에서 자리를 차지하는 파일입니다`도 `literal-verb`에 잡힙니다.
수단, 소유, 시제, 비유를 나타내는 정상 표현도 같은 구절을 쓰므로 두 규칙을 경고로 바꿨습니다.

쉼표 수와 문장 길이, 강조, 명사와 조사의 빈도는 문법이 아니라 문체의 경향을 보여 주는 값입니다. 임계값은 기존 측정값을
유지하되 경고로만 사용합니다. 영어 용어 수는 기본값에서 제한하지 않습니다.
이 분류는 `test/quality.test.mjs`에서 정상 문장과 실제 오류로 함께 검증합니다.

## 설정

목록 항목은 쉼표로 구분하고, 치환 후보는 `원문=후보` 형식으로 씁니다. 목록 키와 치환 후보 키는 여러 줄에 나눠 쓸 수 있습니다.
`max-`로 시작하는 한도 값과 `korean-required-min-chars`는 0으로 두면 그 검사가 꺼집니다. `max-contrast-per-1k`는 `ko=0`처럼 언어별 값을 0으로 두면 그 언어의 검사가 꺼집니다. `register`는 `다나까체`, `해요체`, `혼용` 중 하나입니다.
직역 동사의 활용형은 `|`로 나열하고 영어 목적어 조건은 `@latin:`으로 표시합니다.

```korean-style-rules
advisory-rules: translationese, literal-verb, comma-per-sentence, comma-segment-length, comma-after-conjunctive-adverb, comma-after-connective, sentence-too-long, nominalization, demonstrative-density, suffix-jeok-density, particle-ui-density, redundant-plural, bound-english, repeated-gloss, bold-density, contrast-density, inclusive-term, hybrid-negation, korean-required
register: 다나까체
banned-address: 당신
imperative-endings: 하십시오, 하시오, 해라, 하라, 해줘, 해봐, 하세요, 하십쇼
imperative-exempt: 안녕하세요, 아니다, 감사합니다, 죄송합니다
flattery-openers: 좋은 질문입니다, 좋은 질문이네요, 좋은 질문이십니다, 좋은 지적입니다, 좋은 지적이네요, 좋은 지적이십니다, 훌륭한 질문입니다, 훌륭한 지적입니다, 정확한 지적입니다, 예리한 질문입니다, 아주 중요한 질문입니다
korean-required-min-chars: 40
banned-char: middot, em-dash, en-dash, emoji, hanja, kana, fullwidth-paren
allowed-emoji-shortcode:
sentence-min-hangul-ratio: 0.3
final-endings: 다, 요, 까, 죠, 네, 오, 냐, 군
max-comma-per-sentence: 2
max-comma-segment-words: 8
enumeration-word-max: 8
conjunctive-adverbs: 그리고, 그러나, 그런데, 그러므로, 그래서, 따라서, 하지만, 또한, 즉, 결국, 다만, 반면, 오히려, 예를 들어, 특히, 게다가, 더구나, 한편
connective-endings: 고, 며, 으며, 이며, 지만, 면서, 아서, 어서, 해서, 라서, 이라서, 이라, 거나, 든지, 는데, 은데, 인데, 는데도, 므로, 니까, 으니, 면, 으면, 으나, 아, 어, 여, 해, 되, 아도, 어도, 라도, 도록, 려면, 려고, 기에, 길래, 다가, 더니, 자마자, 느라, 하여, 되어, 아니라, 때문에
max-connective-comma-per-1k: 6
clause-min-words: 2
double-passive: 보여=보이, 쓰여=쓰이, 잊혀=잊히, 읽혀=읽히, 잡혀=잡히, 찢겨=찢기, 닫혀=닫히, 열려=열리, 놓여=놓이, 모여=모이, 짜여=짜이, 나뉘어=나뉘, 불려=불리, 걸려=걸리, 들려=들리, 되어=되, 쌓여=쌓이, 팔려=팔리, 실려=실리, 뽑혀=뽑히, 깎여=깎이, 섞여=섞이, 담겨=담기, 바뀌어=바뀌, 말해=말하
max-sentence-chars: 110
nominalization-endings: 함, 됨, 임, 짐
max-nominalization-per-1k: 3
demonstratives: 해당, 상기, 이것, 그것, 이러한, 그러한, 이와 같은, 그와 같은
max-demonstrative-per-1k: 7
max-suffix-jeok-per-1k: 9
max-particle-ui-per-1k: 16
plural-quantifiers: 여러, 많은, 다양한, 모든, 수많은, 다수의
density-rule-floor: 4
density-margin: 2
translationese-patterns: 를 통해=~해, 을 통해=~해, 를 통하여=~해, 을 통하여=~해, 에 의하여=~이 또는 ~가, 에 의해=~이 또는 ~가, 함에 있어=~할 때, 음에 있어=~할 때, 경우에는=~는, 기간 동안=기간, 매주마다=매주, 매달마다=매달, 매년마다=매년, 매일마다=매일, 았었=았, 었었=었, 하지 않으면 안 된=해야 한, 하지 않으면 안 됩=해야 합, 것이 가능하=~할 수 있, 할 필요가 있=해야 하, 라고 생각된=라고 봅니, 라고 생각됩=라고 봅니, 에 위치하=에 있, 에 위치합=에 있습, 회의를 가지=회의를 하, 회의를 가질=회의를 할, 회의를 가졌=회의를 했, 회의를 가집=회의를 합, 을 가지고 있=이 있, 를 가지고 있=가 있, 를 가능하게=~할 수 있게, 을 가능하게=~할 수 있게, 는 것을 허용=~할 수 있습니다, 는 것을 보장=반드시 ~합니다, 아무리 강조해도 지나치지 않=매우 중요합니다, 에서의=
literal-verbs: @latin:세우|세워|세웁|세운|세울|세웠|세움=띄우거나 실행합니다, 서버를 세우|서버를 세웁|서버를 세워|서버를 세웠=서버를 띄우거나 실행합니다, 환경을 세우|환경을 세웁|환경을 세웠=환경을 구성합니다, 시스템을 세우|시스템을 세웁|시스템을 세웠=시스템을 구축합니다, 빛을 발하=돋보입니다, 자리를 차지하=쓰입니다, 결정을 만드|결정을 만들|결정을 만듭|결정을 만들었=결정을 내립니다
literal-verb-exempt: plan, roadmap, strategy, hypothesis, milestone, baseline, KPI, OKR
loanword-spelling: 워크플로우=워크플로, 리포지토리=리포지터리, 레파지토리=리포지터리, 레포지토리=리포지터리, 디렉토리=디렉터리, 어플리케이션=애플리케이션, 아키텍쳐=아키텍처, 푸쉬=푸시, 라이센스=라이선스, 메세지=메시지, 맵핑=매핑, 컨텐츠=콘텐츠, 컨퍼런스=콘퍼런스, 컨셉=콘셉트, 콘트롤=컨트롤, 타겟=타깃, 썸네일=섬네일, 버젼=버전, 메뉴얼=매뉴얼, 프리젠테이션=프레젠테이션, 워크샵=워크숍, 뱃지=배지, 업그래이드=업그레이드, 플래폼=플랫폼, 네비게이션=내비게이션, 스케쥴=스케줄, 캐쉬=캐시
inclusive-terms: whitelist=Allowlist, blacklist=Blocklist, 화이트리스트=Allowlist, 블랙리스트=Blocklist, slave=Secondary 또는 Follower
banned-transliteration:
banned-translation:
required-spelling:
known-typos: 됬=됐, 어떻해=어떡해, 할께=할게, 갈께=갈게, 있읍니다=있습니다, 없슴=없음, 알겠슴=알겠음, 바꼈=바뀌었, 바뀜었=바뀌었
needs-gloss:
negation-prefixes: 비, 논, 무, 미, 반
max-bound-english-per-sentence: 0
max-repeated-english-gloss: 1
max-bold-per-unit: 3
max-contrast-per-1k: ko=0.8, en=0.5
chat-tool-fields: AskUserQuestion.question, AskUserQuestion.header, AskUserQuestion.label, AskUserQuestion.description, SendUserFile.caption, ExitPlanMode.plan
agent-tool-fields: Task.prompt, Task.description, Agent.prompt, Agent.description
doc-globs:
source-globs:
skip-globs: node_modules/**, dist/**, build/**, coverage/**, vendor/**, .venv/**, **/*.min.js, **/*.generated.*, skill/korean-style/register/*.md
sweep-skip-dirs: .git, node_modules, dist, build, coverage, vendor, .venv, __pycache__, target
```

## 키 설명

| 키  | 뜻 |
| ---  | --- |
| `advisory-rules` | 차단하지 않고 경고로만 보고할 규칙 이름입니다. |
| `register`  | 이 프로젝트가 쓰는 어투입니다. |
| `banned-address`  | 읽는 사람을 부를 때 쓰면 안 되는 말입니다. |
| `imperative-endings`  | 사람에게 명령이 되는 어미입니다. |
| `imperative-exempt`  | 그 어미로 끝나지만 명령이 아닌 표현입니다. |
| `flattery-openers`  | 답부터 하지 않고 질문이나 지적을 칭찬하는 문장입니다. |
| `korean-required-min-chars`  | 코드와 공백을 뺀 글자 수가 이 값 이상인데 한글이 없으면 영어로 쓴 것으로 봅니다. |
| `banned-char`  | `scripts/lib/rules/chars.mjs`의 글자 종류 가운데 켜 둘 것입니다. |
| `allowed-emoji-shortcode`  | 사용자가 이름을 지정해 허용한 shortcode입니다. |
| `sentence-min-hangul-ratio`  | 문장을 한국어 산문으로 보려면 한글이 차지해야 하는 최소 비율입니다. |
| `final-endings`  | 종결어미입니다. |
| `clause-min-words`  | 절로 인정하는 최소 어절 수입니다. |
| `max-comma-per-sentence`  | 한 문장에 쓸 수 있는 쉼표 개수입니다. |
| `enumeration-word-max`  | 나열 항목 하나에 들어갈 수 있는 최대 어절 수입니다. |
| `max-comma-segment-words`  | 쉼표 앞 구간의 최대 어절 수입니다. |
| `conjunctive-adverbs`  | 뒤에 쉼표를 찍으면 안 되는 접속부사입니다. |
| `connective-endings`  | 뒤에 쉼표가 오면 세는 연결어미입니다. |
| `max-connective-comma-per-1k`  | 한글 1000자당 연결어미 뒤 쉼표를 허용하는 횟수입니다. |
| `double-passive`  | 이중피동입니다. |
| `max-sentence-chars`  | 끊지 않고 길게 이어 쓴 문장을 잡는 글자 수 한도입니다. |
| `nominalization-endings`  | 용언을 명사로 바꾸는 어미입니다. |
| `max-nominalization-per-1k`  | 산문 문장이 명사형으로 끝나는 빈도의 한도입니다. |
| `demonstratives`  | 지시 표현입니다. |
| `max-demonstrative-per-1k`  | 위 목록의 빈도 한도입니다. |
| `max-suffix-jeok-per-1k`  | 접미사 `~적`의 빈도 한도입니다. |
| `max-particle-ui-per-1k`  | 관형격 조사 `~의`의 빈도 한도입니다. |
| `plural-quantifiers`  | 뒤따르는 명사에 `~들`을 붙이면 안 되는 수량 표현입니다. |
| `density-rule-floor`  | 밀도 규칙이 판정을 시작하는 최소 횟수입니다. |
| `density-margin`  | 밀도 규칙이 한도에 더하는 여유입니다. |
| `translationese-patterns`  | 번역투 구절과 대신 쓸 표현입니다. |
| `literal-verbs`  | 영어 동사를 직역한 동사입니다. |
| `literal-verb-exempt`  | 직역 동사 규칙이 건드리지 않을 영어 목적어입니다. |
| `loanword-spelling`  | 틀린 외래어 표기와 규범 표기입니다. |
| `inclusive-terms`  | 차별 소지가 있는 용어와 대체 용어입니다. |
| `banned-transliteration`  | 한글 음차와 대신 쓸 영어입니다. |
| `banned-translation`  | 뜻을 대강 옮긴 기술 용어와 대신 쓸 영어입니다. |
| `required-spelling`  | 틀리지는 않았지만 이 팀이 쓰지 않는 표기입니다. |
| `known-typos`  | 한국어 낱말이 아닌 철자입니다. |
| `needs-gloss`  | 처음 나올 때 설명해야 하는 용어입니다. |
| `negation-prefixes`  | 영어 어간에 붙이면 안 되는 한글 부정 접두사입니다. |
| `max-bound-english-per-sentence`  | 한국어 문장 하나에 조사를 붙여 쓸 수 있는 영어 낱말 수입니다. |
| `max-repeated-english-gloss`  | 같은 영어 용어를 괄호로 설명할 수 있는 횟수입니다. |
| `max-bold-per-unit`  | 문단이나 항목 하나에 쓸 수 있는 굵은 글씨 개수입니다. |
| `max-contrast-per-1k`  | 대조 구문의 언어별 밀도 한도입니다. |
| `chat-tool-fields`  | 사람이 읽는 산문이 들어가는 도구 입력 필드입니다. |
| `agent-tool-fields`  | agent가 읽는 산문이 들어가는 도구 입력 필드입니다. |
| `doc-globs`, `source-globs`  | 확장자보다 먼저 적용해 검사 종류를 정하는 경로 패턴입니다. |
| `skip-globs`  | 검사하지 않을 경로입니다. |
| `sweep-skip-dirs`  | 전체 검사에서 들어가지 않을 디렉터리 이름입니다. |

## 보고 이름

| 규칙 | 의미 |
| --- | --- |
| `banned-char` | 프로젝트가 금지한 부호와 문자입니다. |
| `banned-address` | 금지 목록에 있는 호칭입니다. |
| `wrong-register` | 선택한 어투와 다른 종결어미입니다. |
| `imperative-to-human` | 프로젝트가 피하기로 한 직접 명령입니다. |
| `flattery` | 칭찬으로 시작하는 표현입니다. |
| `korean-required` | 긴 영어 답변입니다. 요청한 언어인지는 사람이 판단합니다. |
| `double-passive` | 목록에 있는 이중피동 후보입니다. |
| `loanword-spelling` | 프로젝트가 정한 외래어 표기와 다른 표기입니다. |
| `known-typo` | 목록에 있는 오타입니다. |
| `translationese` | 번역투 후보입니다. 문맥에 맞는 표현이면 그대로 둡니다. |
| `literal-verb` | 직역 동사 후보입니다. 실제 동작을 나타낸 문장이면 그대로 둡니다. |
| `comma-per-sentence` | 한 문장의 쉼표 수입니다. 나열은 제외합니다. |
| `comma-segment-length` | 쉼표로 나눈 구간의 어절 수입니다. |
| `comma-after-conjunctive-adverb` | 접속부사 뒤 쉼표입니다. |
| `comma-after-connective` | 연결어미 뒤 쉼표의 빈도입니다. |
| `sentence-too-long` | 긴 산문 문장입니다. |
| `nominalization` | 명사형 종결의 빈도입니다. |
| `demonstrative-density` | 지시 표현의 빈도입니다. |
| `suffix-jeok-density` | 접미사 `~적`의 빈도입니다. |
| `particle-ui-density` | 조사 `~의`의 빈도입니다. |
| `redundant-plural` | 수량 표현 뒤 복수 접미사입니다. |
| `bound-english` | 한 문장에서 조사가 붙은 영어 낱말 수입니다. 기본값에서는 제한하지 않습니다. |
| `repeated-gloss` | 같은 영어 용어의 반복 설명입니다. |
| `bold-density` | 문단이나 항목 안의 강조 수입니다. |
| `contrast-density` | 대조 구문의 빈도입니다. |
| `inclusive-term` | 팀에서 검토할 용어입니다. |
| `hybrid-negation` | 한국어 부정 접두사와 영어를 붙인 표현입니다. |
| `unexplained-term` | 설명이 필요한 것으로 등록한 용어입니다. |
| `transliteration` | 팀이 쓰지 않기로 한 음차 표기입니다. |
| `loose-translation` | 팀이 쓰지 않기로 한 번역 표기입니다. |
| `required-spelling` | 팀 표기와 다른 용어입니다. |

## 변경과 검증

규칙 값과 설명을 함께 고치고, 잡아야 할 문장과 잡으면 안 되는 문장을 테스트에 넣습니다.
`npm run gate`로 확인합니다. 생성 지침을 바꾸면 동일한 입력으로 실모델 응답도 비교합니다.
