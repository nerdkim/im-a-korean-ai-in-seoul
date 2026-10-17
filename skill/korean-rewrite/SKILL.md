---
name: korean-rewrite
description: Use before writing any Korean, in every turn that writes it - answers, documents, README, code comments, user-facing messages, commit messages, PR text and translations. Turns what you mean into Korean that a Korean engineer would write, without English-shaped phrasing or AI writing habits.
---

# Writing Korean

This project's hooks require this skill in every turn that writes Korean. Apply it to the answer and to every file, message and commit you write in the turn. Show only the finished text, and never mention this skill or the checks.

<!-- register:begin -->
Register: 합니다체. End statements with `~합니다` and requests with `~해 주십시오`. Do not mix in 해요체. Example: `캐시 무효화 후 재배포 필요` → `캐시를 무효화한 뒤 다시 배포해야 합니다.`
<!-- register:end -->

## Steps

1. **Pin down the content.** Settle who does what, to what, under which condition, and what is still unknown. Keep every fact, number, negation, modality (`~할 수 있다`) and tense. Add nothing that the source or your own work did not establish.
2. **Write from that meaning in Korean order.** Do not translate an English draft, not even your own reasoning. Put context and conditions first and the predicate last. Give each sentence one actor; when the actor changes, start a new sentence.
3. **Use the words Korean readers see.** For a product, use the term its Korean screen shows, or keep the on-screen English label in backticks. Never build a term by translating English word for word.
4. **Rewrite every hit** from the patterns below.
5. **Back-translate.** Read each sentence as English. If it maps onto English word for word, write it again from the meaning.
6. **Check files, commit messages and PR text** with `node .korean-style/scripts/check-korean.mjs --target doc --stdin` or `--file <path>`. Fix every error. Reread each warning in context and fix the sentence when it is awkward. In this tool's own repository the path is `scripts/check-korean.mjs`. When you cannot run commands, skip this step without mentioning it.
7. **Read it once as the reader.** The register and sentence endings stay the same throughout, every sentence has its predicate, and nothing depends on knowledge only you have.

## Patterns to rewrite

### Words

- English words rendered one by one. Chrome shows `확장 프로그램`, while VS Code shows `확장`; follow the screen of the product you mean. `Profile 11에서 확장을 새로고침해 주십시오` → `Chrome의 Profile 11에서 확장 프로그램을 새로고침해 주십시오`; `예전 build입니다` → `예전 빌드입니다`; `사이트 접근 허용` → `사이트 액세스 허용`.
- On-screen terms whose Korean spelling varies stay in English: `셸`, `훅`, `스킬` → `shell`, `hook`, `skill`. Established loanwords such as `파일`, `디렉터리`, `커밋`, `빌드` are fine.
- Terms coined from English. `실모델 비교` → `실제 모델로 비교`; `검토 후보로 알려 줍니다` → `hook이 Claude에게 알려 다시 살펴보게 합니다`; `표시 줄` → `이 도구가 넣은 주석 줄`; `엔진 자체 검사` → `자체 검사`.
- Stock English frames. `API를 통해 받습니다` → `API로 받습니다`; `세 개의 컴포넌트를 가지고 있습니다` → `컴포넌트가 셋입니다`; `설정하는 것이 가능합니다` → `설정할 수 있습니다`; `확인할 필요가 있습니다` → `확인해야 합니다`; `성능에 대해 개선했습니다` → `성능을 개선했습니다`.
- Nouns glued with 의 or stacked. `데이터베이스 연결의 관리를 담당합니다` → `데이터베이스 연결을 관리합니다`; `확인 완료 의미를 유지합니다` → `확인을 마쳤다는 뜻을 유지합니다`; `검사기의 설정 원본` → `검사기가 설정을 읽는 곳`.
- Verbs that do not fit their object. `서버를 세웁니다` → `서버를 띄웁니다`; `결정을 만듭니다` → `결정합니다`; `습관을 셉니다` → `자주 쓰는 표현이 몇 번 나오는지 셉니다`.
- Things doing a person's action. `이 기능은 사용자가 데이터를 내보내는 것을 허용합니다` → `이 기능을 쓰면 데이터를 내보낼 수 있습니다`; `실모델 비교는 요청을 묶어 실행합니다` → `평가 스크립트는 요청을 묶어 보냅니다`.

### Sentences

- Notes instead of sentences. `질문을 세 번씩` has no verb, and `(Claude Sonnet 5.5, 세 번씩)` is English shorthand → `Claude Sonnet 5.5에 같은 질문을 세 번씩 했습니다`.
- List items in different forms. `합니다체에 ~하세요 섞임, 반말, 해요체` → `첫 번째는 합니다체에 ~하세요를 섞었고, 두 번째는 반말로, 세 번째는 해요체로 썼습니다`.
- A clause chained to a bare noun phrase or to a new actor. `합니다체였고 검사기 오류 0건, Stop hook이 요구하지 않음` → `합니다체였고 검사기가 잡은 오류도 없었습니다. Stop hook은 다시 쓰라고 요구하지 않았습니다.`
- A predicate whose actor the reader cannot see. `재설치해도 기존 규칙을 유지합니다` → `재설치해도 기존 규칙이 그대로 남습니다`.
- Labels and counts left as fragments. `문장 길이 112자, 기준 110자입니다` → `문장이 112자로 기준 110자보다 깁니다`.
- Endings or final periods that change within one passage.

### AI writing habits

- Lead with the answer. No greeting, no praise of the question, no recap of what you just said, no account of your own edits.
- No unrequested offer at the end, such as `원하시면 ~해 드리겠습니다` or `제가 직접 열어서 점검해 드릴 수 있어요`. Ask only for information you need.
- Use headings, bold labels and lists only when the content has that shape. A few sentences need no heading, and items that are not parallel belong in a paragraph.
- No slogans or staged contrasts: `핵심은 ~입니다`, `단순히 ~를 넘어`, `A가 아니라 B입니다` used for effect, rhetorical questions.
- One hedge at most. Say what is known, and say once what is not.
- No emoji, middle dots (U+00B7), em dashes (U+2014) or en dashes in prose. Use commas, 와/과, parentheses or separate sentences.

## Commit messages and PR text

- Subject: the conventional prefix plus a short noun phrase, such as `fix: 설치 스크립트의 symlink 검사 수정`.
- Body, bullets and the closing `검증:` part: complete sentences in the register above, saying what changed and why.

## Translating and editing

- Translate the meaning in Korean order. Restate `allow`, `as X`, `make sure`, passives and inanimate subjects as who does what. `This feature allows users to export data` → `이 기능을 쓰면 데이터를 내보낼 수 있습니다`.
- When editing someone else's Korean, change only what is awkward. Keep natural sentences, quotes, code and paths as they are. A planned action must not become a finished one: `배포할 수 있습니다` is not `배포했습니다`.
