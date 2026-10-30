# 검사 규칙

검사기는 이 문서의 `korean-style-rules` 블록에서 규칙을 읽습니다. 설치한 프로젝트에서는 `.korean-style/rules.md`가 이 문서를 대신합니다.
작성 지침은 이 도구 저장소의 `output-styles/korean-style.md`에 있고 설치한 프로젝트에서는 `.claude/output-styles/korean-style.md`에 있습니다.
Claude Code는 세션을 시작할 때 작성 지침을 시스템 프롬프트에 넣습니다. hook은 실행될 때마다 이 문서를 새로 읽습니다. 그래서 Claude가 작성 지침과 이 문서를 직접 읽을 필요는 없습니다.

## 오류와 경고

- hook은 오류가 있는 글이 파일, 커밋, PR에 남지 않게 막습니다. 답변에 오류가 있으면 한 번 다시 쓰게 합니다. 오류로 나눈 규칙은 말투와 표기처럼 프로젝트가 정한 정책입니다.
- 기본 규칙에서는 `banned-char`에 든 문자를 산문에 쓰면 검사기가 오류로 잡습니다. 가운뎃점(U+00B7)과 줄표(U+2014)도 여기에 듭니다. 나열은 쉼표나 조사로 잇고 덧붙이는 설명은 괄호나 다른 문장으로 씁니다.
- 검사기는 Claude Code가 커밋 메시지와 PR 설명에 붙이는 생성 표시도 오류로 잡습니다. 막을 문구는 `banned-attribution`에 적습니다.
- 글이 `advisory-rules`에 든 규칙에 걸리면 검사기는 경고로만 보고합니다. CLI는 경고를 보여 줍니다. hook은 경고 때문에 쓰기를 막거나 다시 쓰라고 요구하지 않습니다.
- PreToolUse hook은 `review-rules`에 든 규칙의 경고를 Claude에게 알립니다. 이때도 쓰기는 막지 않습니다. hook은 이번에 바꾼 문단에서 새로 생긴 경고만 알립니다. 어색하면 고치고 문맥에 맞으면 그대로 두라는 말도 덧붙입니다.
- CLI의 종료 코드는 오류가 있으면 1, 사용법이 틀리면 2입니다. 경고만 있으면 0이고 `--strict`를 붙이면 경고만 있어도 1입니다.
- CLI는 규칙을 읽지 못하면 실패합니다. hook은 규칙을 읽지 못해도 멈추지 않습니다. 이때 hook은 금지 문자, 금지 호칭, 영어로만 쓴 답변, 생성 표시만 검사하고 `writing-skill`의 기본값인 `korean-rewrite` skill을 요구합니다. 규칙을 읽지 못하는 문제는 `doctor`와 `gate`로 확인합니다.

## 한국어를 쓰기 전에 부르는 skill

- Claude는 요청을 받을 때마다 한국어를 쓰기 전에 `writing-skill`에 적은 skill을 불러야 합니다. 사용자가 프롬프트를 보낼 때마다 UserPromptSubmit hook이 이 skill을 부르라고 Claude에게 알립니다.
- Claude가 그 요청에서 skill을 부르지 않은 채 파일을 쓰거나 커밋하거나 PR을 올리려 하면 PreToolUse hook이 막습니다. 이번에 쓰는 내용에 한글이 `writing-skill-min-hangul`에 적은 수 이상 들어 있을 때만 막습니다. skill을 부르지 않은 채 한국어 답변을 마치면 Stop hook이 Claude에게 skill을 부른 뒤 답변을 다시 쓰라고 요구합니다.
- subagent가 파일을 쓸 때는 hook이 그 subagent의 대화 기록에서 skill을 불렀는지 봅니다.
- hook은 같은 요청에서 skill을 부르지 않았다는 이유로 두 번 막았는데도 Claude가 skill을 부르지 않으면 Skill 도구를 쓸 수 없는 환경이라고 봅니다. 그 뒤로는 이 이유로 막지 않습니다.
- `writing-skill:`처럼 값을 비우거나 그 skill이 `.claude/skills/`에 없으면 hook은 skill을 요구하지 않습니다. 직접 고친 예전 규칙처럼 `writing-skill`과 `writing-skill-min-hangul` 키가 아예 없으면 기본값인 `korean-rewrite`와 20을 씁니다.

## 일부 규칙을 경고로만 두고 영어 용어 수를 제한하지 않는 이유

글을 고칠 때는 원문의 뜻을 지켜야 합니다. 그래서 자연스러운 표현을 바꾸거나 원문에 없는 사실을 덧붙여야 통과하는 규칙은 오류로 두지 않습니다.

`문을 통해 들어갑니다`, `책을 가지고 있습니다`, `예전에는 서울에 살았었습니다`는 문맥에 맞는 표현인데도 `translationese`에 걸립니다. `디스크에서 자리를 차지하는 파일입니다`와 `사과 세 개에 두 개를 더하면 다섯 개가 됩니다`도 `literal-verb`에 걸립니다.
경로, 소유, 시제, 비유, 셈을 나타내는 정상적인 문장에도 같은 구절이 들어가므로 두 규칙은 경고로만 둡니다.

쉼표 수, 문장 길이, 굵은 글씨 수, 명사형 종결이나 `~의`가 나오는 빈도는 문법 오류가 아니라 문체 경향을 보여 주는 값입니다.
한도 값은 전에 측정해 정한 그대로 두고 경고를 낼지 정할 때만 씁니다. 기본 규칙은 영어 용어 수를 제한하지 않습니다.
이 도구 저장소의 `test/quality.test.mjs`에는 정상 문장과 실제 오류 문장이 함께 들어 있습니다. 이 테스트로 정상 문장에는 경고만 나오고 실제 오류 문장에는 오류가 나오는지 확인합니다.

긴 문장 경고는 글을 읽기 쉽게 하려고 둔 것입니다. 경고를 없애려고 한 가지 뜻을 담은 문장을 쪼개지 않습니다.

## 설정

목록은 쉼표로 나누고, 고칠 표현은 `원문=후보` 형식으로 씁니다. 목록이나 고칠 표현을 값으로 받는 키는 줄마다 같은 키를 다시 적으면 값을 여러 줄에 나눠 쓸 수 있습니다.
`max-`로 시작하는 한도 값과 `korean-required-min-chars`는 0으로 두면 그 검사가 꺼집니다. `max-contrast-per-1k`는 `ko=0`처럼 언어별 값을 0으로 두면 그 언어의 검사가 꺼집니다.
`register` 값은 `합니다체`, `해요체`, `혼용` 가운데 하나입니다. 합니다체는 국립국어원 문법 용어로 하십시오체입니다. 이 도구는 0.3.0까지 합니다체를 `다나까체`라고 불렀습니다. 검사기와 설치 스크립트는 `하십시오체`와 `다나까체`도 `합니다체`로 읽습니다.
`literal-verbs`에서는 동사 활용형을 `|`로 나열합니다. 목적어가 영어 낱말일 때만 잡으려면 항목 앞에 `@latin:`을 붙입니다. 숫자 바로 뒤에 붙은 `cm`, `%p` 같은 단위는 목적어로 보지 않습니다.
정해 둔 낱말이 목적어일 때만 잡을 직역 동사는 `object-verbs`에 적습니다. 항목마다 `>` 앞에 목적어 낱말을 `|`로 나열하고 `>` 뒤에 동사 활용형을 적습니다. 검사기는 이 키의 항목에 걸린 문장도 `literal-verb` 규칙으로 보고합니다. 이 항목은 목적어에 `을`, `를`이 붙은 문장과 `효과는 재지 않았습니다`처럼 `은`, `는`을 붙여 목적어를 앞에 내세운 문장을 모두 봅니다. 적은 낱말 앞에 한글이 붙어 있으면 다른 낱말로 보고 잡지 않습니다. 그래서 `표`와 `테스트`를 적어도 `목표`와 `통합테스트`는 잡지 않습니다. 검사기는 `@latin:` 항목과 `object-verbs` 항목 모두에서 목적어와 조사 사이에 넣은 괄호 설명을 건너뜁니다.

```korean-style-rules
advisory-rules: translationese, literal-verb, comma-per-sentence, comma-segment-length, comma-after-conjunctive-adverb, comma-after-connective, sentence-too-long, nominalization, demonstrative-density, suffix-jeok-density, particle-ui-density, redundant-plural, bound-english, repeated-gloss, bold-density, contrast-density, inclusive-term, hybrid-negation, korean-required
review-rules: translationese, literal-verb, redundant-plural, comma-after-conjunctive-adverb, hybrid-negation, inclusive-term, sentence-too-long
register: 합니다체
banned-address: 당신
imperative-endings: 하십시오, 하시오, 해라, 하라, 해줘, 해봐, 하세요, 하십쇼
imperative-exempt: 안녕하세요, 아니다, 감사합니다, 죄송합니다
flattery-openers: 좋은 질문입니다, 좋은 질문이네요, 좋은 질문이십니다, 좋은 지적입니다, 좋은 지적이네요, 좋은 지적이십니다, 훌륭한 질문입니다, 훌륭한 지적입니다, 정확한 지적입니다, 예리한 질문입니다, 아주 중요한 질문입니다
korean-required-min-chars: 40
writing-skill: korean-rewrite
writing-skill-min-hangul: 20
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
translationese-patterns: 를 통해=~해, 을 통해=~해, 를 통하여=~해, 을 통하여=~해, 에 의하여=~이 또는 ~가, 에 의해=~이 또는 ~가, 함에 있어=~할 때, 음에 있어=~할 때, 경우에는=~는, 기간 동안=기간, 매주마다=매주, 매달마다=매달, 매년마다=매년, 매일마다=매일, 았었=았, 었었=었, 하지 않으면 안 된=해야 한, 하지 않으면 안 됩=해야 합, 것이 가능하=~할 수 있, 할 필요가 있=해야 하, 라고 생각된=라고 봅니, 라고 생각됩=라고 봅니, 에 위치하=에 있, 에 위치합=에 있습, 회의를 가지=회의를 하, 회의를 가질=회의를 할, 회의를 가졌=회의를 했, 회의를 가집=회의를 합, 을 가지고 있=이 있, 를 가지고 있=가 있, 를 가능하게=~할 수 있게, 을 가능하게=~할 수 있게, 는 것을 허용=~할 수 있습니다, 는 것을 보장=반드시 ~합니다, 아무리 강조해도 지나치지 않=매우 중요합니다, 에서의=, 코드 밖에서=코드가 아닌 사용자가 직접, 어떤 모양으로=어떻게 또는 어떤 형식으로, 돌고 있=실행되고 있, 도는 중=실행 중, 돕니다=실행됩니다, 돌지 않=실행되지 않, 도는지=실행되는지, 돌았습=실행됐습, 시험용=테스트용, 시험 파일=테스트 파일, 시험 데이터=테스트 데이터, 시험 data=테스트 data, 승인을 묻=승인을 요청하, 승인을 물=승인을 요청하
literal-verbs: @latin:세우|세워|세웁|세운|세울|세웠|세움=띄우거나 실행합니다, 서버를 세우|서버를 세웁|서버를 세워|서버를 세웠=서버를 띄우거나 실행합니다, 환경을 세우|환경을 세웁|환경을 세웠=환경을 구성합니다, 시스템을 세우|시스템을 세웁|시스템을 세웠=시스템을 구축합니다, 빛을 발하=돋보입니다, 자리를 차지하=쓰입니다, 결정을 만드|결정을 만들|결정을 만듭|결정을 만들었=결정을 내립니다
literal-verbs: @latin:더하고|더하면|더하는|더하려|더하지|더하여|더하자|더하겠|더해|더한|더할지|더할 수|더할 때|더할 예정|더할 계획|더할 거|더할 겁|더할까|더했|더합=추가합니다
object-verbs: 테스트|항목|줄|행|표|절|문단|문장|목록|기능|화면|버튼|메뉴|권한|조건|옵션|플래그|설정|단계|규칙|검사|안내|알림|문구|저장소|파일|함수|패키지|라이브러리|의존성|예시|경우|필드|키|표시|링크|탭|정보|이름|요청|개|가지|건|곳>더하고|더하면|더하는|더하려|더하지|더하여|더하자|더하겠|더해|더한|더할지|더할 수|더할 때|더할 예정|더할 계획|더할 거|더할 겁|더할까|더했|더합=추가합니다, 효과|성능|사용량|전송량|처리량|트래픽|비용|대역폭|규모|용량|부하|지표|영향>재지|재고 있|재려|잰|잴|잽니|쟀|재었|재야|재서|재면|재 보|재 봤|재 볼|재겠=측정합니다
literal-verb-exempt: plan, roadmap, strategy, hypothesis, milestone, baseline, KPI, OKR
loanword-spelling: 워크플로우=워크플로, 리포지토리=리포지터리, 레파지토리=리포지터리, 레포지토리=리포지터리, 디렉토리=디렉터리, 어플리케이션=애플리케이션, 아키텍쳐=아키텍처, 푸쉬=푸시, 라이센스=라이선스, 메세지=메시지, 맵핑=매핑, 컨텐츠=콘텐츠, 컨퍼런스=콘퍼런스, 컨셉=콘셉트, 콘트롤=컨트롤, 타겟=타깃, 썸네일=섬네일, 버젼=버전, 메뉴얼=매뉴얼, 프리젠테이션=프레젠테이션, 워크샵=워크숍, 뱃지=배지, 업그래이드=업그레이드, 플래폼=플랫폼, 네비게이션=내비게이션, 스케쥴=스케줄, 캐쉬=캐시
inclusive-terms: whitelist=Allowlist, blacklist=Blocklist, 화이트리스트=Allowlist, 블랙리스트=Blocklist, slave=Secondary 또는 Follower
banned-transliteration:
banned-translation:
required-spelling:
known-typos: 됬=됐, 어떻해=어떡해, 할께=할게, 갈께=갈게, 있읍니다=있습니다, 없슴=없음, 알겠슴=알겠음, 바꼈=바뀌었, 바뀜었=바뀌었
calques: 비멱등=멱등하지 않은, 미추적=추적하지 않는, 반랙=half-rack, 전랙=full-rack, 응답 모양=응답 형식, 바깥 접속=외부 접속
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
skip-globs: node_modules/**, dist/**, build/**, coverage/**, vendor/**, .venv/**, **/*.min.js, **/*.generated.*, skill/korean-style/register/*.md, **/_workspace/**
sweep-skip-dirs: .git, node_modules, dist, build, coverage, vendor, .venv, __pycache__, target
quote-marker: korean-style-quote
banned-attribution: Generated with [Claude Code], Generated with Claude Code, noreply@anthropic.com
```

## 키 설명

| 키  | 뜻 |
| ---  | --- |
| `advisory-rules` | 막지 않고 경고로만 보고할 규칙 이름입니다. |
| `review-rules` | 경고 규칙 가운데 hook이 Claude에게 알릴 규칙입니다. 이번에 바꾼 문단에서 새로 생긴 경고만 알립니다. |
| `register`  | 프로젝트가 쓰는 말투입니다. |
| `banned-address`  | 읽는 사람을 부를 때 쓰면 안 되는 말입니다. |
| `imperative-endings`  | 사람에게 명령이 되는 어미입니다. |
| `imperative-exempt`  | 명령 어미나 다른 말투의 어미로 끝나지만 위반으로 보지 않는 표현입니다. |
| `flattery-openers`  | 답부터 하지 않고 질문이나 지적을 칭찬하는 문장입니다. |
| `korean-required-min-chars`  | 코드와 공백을 뺀 글자 수가 이 값 이상인데 한글이 없으면 영어로 쓴 것으로 봅니다. |
| `writing-skill`  | Claude가 요청을 받을 때마다 한국어를 쓰기 전에 불러야 하는 skill입니다. 값을 비우면 hook이 skill을 요구하지 않습니다. 키가 없으면 `korean-rewrite`를 씁니다. |
| `writing-skill-min-hangul`  | 답변이나 커밋 메시지, 이번에 파일에 쓰는 내용에 한글이 이 수 이상 들어 있으면 hook이 skill을 요구합니다. |
| `banned-char`  | 검사할 글자 종류입니다. 쓸 수 있는 이름은 `scripts/lib/rules/chars.mjs`에 있습니다. |
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
| `max-demonstrative-per-1k`  | 지시 표현의 빈도 한도입니다. |
| `max-suffix-jeok-per-1k`  | 접미사 `~적`의 빈도 한도입니다. |
| `max-particle-ui-per-1k`  | 관형격 조사 `~의`의 빈도 한도입니다. |
| `plural-quantifiers`  | 뒤따르는 명사에 `~들`을 붙이면 안 되는 수량 표현입니다. |
| `density-rule-floor`  | 밀도 규칙을 적용하려면 표현이 나와야 하는 최소 횟수입니다. |
| `density-margin`  | 밀도 규칙이 한도에 더하는 여유입니다. |
| `translationese-patterns`  | 영어식 구절과 대신 쓸 표현입니다. |
| `literal-verbs`  | 영어 동사를 직역한 동사입니다. |
| `literal-verb-exempt`  | 직역 동사 규칙에서 예외로 두는 영어 목적어입니다. |
| `object-verbs`  | 정해 둔 낱말이 목적어일 때만 잡는 직역 동사입니다. 0.3.5까지의 검사기는 이 키를 읽지 않습니다. |
| `loanword-spelling`  | 틀린 외래어 표기와 규범 표기입니다. |
| `inclusive-terms`  | 차별 소지가 있는 용어와 대체 용어입니다. |
| `banned-transliteration`  | 한글 음차와 대신 쓸 영어입니다. |
| `banned-translation`  | 뜻을 대강 옮긴 기술 용어와 대신 쓸 영어입니다. |
| `required-spelling`  | 틀리지는 않았지만 팀이 쓰지 않는 표기입니다. |
| `known-typos`  | 한국어 낱말이 아닌 철자입니다. |
| `calques`  | 영어를 낱말 단위로 옮겨 만든 말과 대신 쓸 표현입니다. 코드 블록, 인라인 코드, 같은 줄에서 닫은 따옴표 안에 옮겨 적은 말은 잡지 않습니다. 앞에 한글이 붙어 있으면 다른 낱말의 일부로 보고 잡지 않습니다. |
| `needs-gloss`  | 처음 나올 때 설명해야 하는 용어입니다. |
| `negation-prefixes`  | 영어 어간에 붙이면 안 되는 한글 부정 접두사입니다. |
| `max-bound-english-per-sentence`  | 한국어 문장 하나에 조사를 붙여 쓸 수 있는 영어 낱말 수입니다. |
| `max-repeated-english-gloss`  | 같은 영어 용어를 괄호로 설명할 수 있는 횟수입니다. |
| `max-bold-per-unit`  | 문단이나 항목 하나에 쓸 수 있는 굵은 글씨 개수입니다. |
| `max-contrast-per-1k`  | 대조 구문의 언어별 밀도 한도입니다. |
| `chat-tool-fields`  | 사람이 읽는 산문이 들어가는 Claude Code 도구 입력 필드입니다. |
| `agent-tool-fields`  | agent가 읽는 산문이 들어가는 Claude Code 도구 입력 필드입니다. |
| `doc-globs`, `source-globs`  | 확장자보다 먼저 적용해 검사 종류를 정하는 경로 패턴입니다. |
| `skip-globs`  | 검사하지 않을 경로입니다. |
| `sweep-skip-dirs`  | 전체 검사에서 들어가지 않을 디렉터리 이름입니다. |
| `banned-attribution` | Claude Code가 커밋 메시지와 PR 설명 끝에 붙이는 생성 표시입니다. 같은 줄에서 이 문구 앞에 글자나 숫자가 없으면 막고 이메일 주소처럼 `@`가 든 문구는 줄 어디에 있어도 막습니다. 그래서 emoji나 목록 기호 뒤에 붙은 생성 표시도 막지만 문장 안에서 생성 표시를 언급하기만 한 줄은 막지 않습니다. 대소문자는 가리지 않습니다. 값을 비우면 검사하지 않습니다. 키가 없으면 기본 목록을 씁니다. |
| `quote-marker`  | 인용 구간을 나타내는 이름입니다. 문서에서 `<!-- 이 값 -->` 줄과 `<!-- /이 값 -->` 줄 사이에 넣은 글은 다른 글을 그대로 옮긴 인용으로 보고 검사하지 않습니다. 답변과 커밋 메시지에서는 이 구간도 검사합니다. 값을 비우면 인용 표시가 있어도 그 사이를 검사합니다. 키가 없으면 `korean-style-quote`를 씁니다. |

## 보고에 나오는 규칙 이름

| 규칙 | 의미 |
| --- | --- |
| `banned-char` | 프로젝트가 금지한 부호와 문자입니다. |
| `banned-address` | 금지 목록에 있는 호칭입니다. |
| `wrong-register` | 고른 말투와 다른 종결어미입니다. |
| `imperative-to-human` | 프로젝트가 피하기로 한 직접 명령입니다. |
| `flattery` | 질문이나 지적을 칭찬하는 표현입니다. |
| `korean-required` | 긴 영어 답변입니다. 요청한 언어인지는 사람이 판단합니다. |
| `double-passive` | 목록에 있는 이중피동입니다. |
| `loanword-spelling` | 프로젝트가 정한 외래어 표기와 다른 표기입니다. |
| `known-typo` | 목록에 있는 오타입니다. |
| `calque` | 영어를 낱말 단위로 옮겨 만든 말입니다. |
| `translationese` | 영어식 표현일 수 있는 구절입니다. 문맥에 맞는 표현이면 그대로 둡니다. |
| `literal-verb` | 영어 동사를 그대로 옮겼을 수 있는 동사입니다. 실제 동작을 나타낸 문장이면 그대로 둡니다. |
| `comma-per-sentence` | 한 문장에 쓴 쉼표 수입니다. 나열에 쓴 쉼표는 세지 않습니다. |
| `comma-segment-length` | 쉼표로 나눈 구간의 어절 수입니다. |
| `comma-after-conjunctive-adverb` | 접속부사 뒤 쉼표입니다. |
| `comma-after-connective` | 연결어미 뒤 쉼표의 빈도입니다. |
| `sentence-too-long` | 긴 산문 문장입니다. |
| `nominalization` | 명사형 종결의 빈도입니다. |
| `demonstrative-density` | 지시 표현의 빈도입니다. |
| `suffix-jeok-density` | 접미사 `~적`의 빈도입니다. |
| `particle-ui-density` | 조사 `~의`의 빈도입니다. |
| `redundant-plural` | 수량 표현 뒤 복수 접미사입니다. |
| `bound-english` | 한 문장에서 조사가 붙은 영어 낱말 수입니다. 기본 규칙에서는 제한하지 않습니다. |
| `repeated-gloss` | 같은 영어 용어의 반복 설명입니다. |
| `bold-density` | 문단이나 항목 안의 굵은 글씨 수입니다. |
| `contrast-density` | `A가 아니라 B`, `~라기보다`, `rather than` 같은 대조 구문의 빈도입니다. `뿐만 아니라`처럼 내용을 덧붙이는 표현과 `다름이 아니라`는 세지 않습니다. `아니라는`, `아니라면` 같은 활용형도 세지 않습니다. |
| `inclusive-term` | 차별 소지가 있는 용어입니다. |
| `hybrid-negation` | 한글 부정 접두사와 영어를 붙인 표현입니다. |
| `unexplained-term` | 설명이 필요한 것으로 등록한 용어입니다. |
| `transliteration` | 팀이 쓰지 않기로 한 음차 표기입니다. |
| `loose-translation` | 팀이 쓰지 않기로 한 번역 표기입니다. |
| `required-spelling` | 팀 표기와 다른 용어입니다. |
| `ai-attribution` | Claude Code가 붙이는 생성 표시입니다. 코드 블록 안에서도 찾습니다. |

## 규칙을 바꿀 때

규칙 값과 설명을 함께 고치고, 잡아야 할 문장과 잡으면 안 되는 문장을 함께 확인합니다.
이 도구 저장소에서는 두 종류의 문장을 테스트에 넣고 `npm run gate`로 확인합니다. 설치한 프로젝트에서는 `check-korean.mjs --text`로 확인합니다.
이 도구 저장소에서 작성 지침이나 skill을 바꾸면 `test/fixtures/eval/`의 요청을 실제 모델에 보냅니다. 그리고 바꾸기 전에 받은 답변과 새로 받은 답변을 비교합니다.
