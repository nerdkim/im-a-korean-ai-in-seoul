# im-a-korean-ai-in-seoul

Claude Code에서 Claude가 쓰는 한국어를 바로잡는 도구입니다.

Claude Code를 쓰는 프로젝트에 설치하면, Claude가 답변이나 문서, 코드 주석, 커밋 메시지를 한국어로 쓸 때마다 다음 두 단계를 거칩니다.

1. Claude가 쓰기 전에 `korean-rewrite` skill을 불러 그 안의 한국어 작성 절차에 따라 씁니다. 이 skill에는 Claude가 실제로 쓴 어색한 문장과 고친 문장이 예시로 들어 있습니다.
2. hook이 Claude가 쓴 글을 검사합니다. 어투가 섞이거나 금지한 문자가 들어간 글은 파일과 커밋에 남기 전에 막고, 답변은 다시 쓰게 합니다. Claude가 skill을 부르지 않고 한국어를 썼을 때도 마찬가지입니다.

## 설치하면 달라지는 점

같은 요청 열두 가지를 이 도구가 없는 프로젝트와 설치한 프로젝트에서 Claude Opus 5.5에 두 번씩 보냈습니다. 그렇게 받은 답변 24개씩을 비교했습니다.

- **정한 어투로만 씁니다.** 이 도구가 없는 쪽은 19개 답변에 `확인하세요`, `해 보세요` 같은 해요체 어미가 들어갔고, 그 가운데 14개는 한 답변 안에서 합니다체와 해요체를 섞었습니다. 설치한 쪽은 24개 답변 모두 합니다체로 썼습니다.
- **머리말과 덧붙이는 말이 거의 없습니다.** 이 도구가 없는 쪽은 7개 답변을 `코드를 아직 보지 못해서 언어나 구조에 매이지 않는 형태로 썼어요.` 같은 머리말로 시작했습니다. 16개 답변 끝에는 `실제 코드를 붙여 주시면 그 코드에 맞춘 수정 예시로 다시 써 드릴게요.` 같은 제안이나 설명을 붙였습니다. 설치한 쪽은 머리말이 없었고, 끝에 인프라 구성을 알려 달라고 한 답변이 2개였습니다.
- **메모에 없는 내용을 지어 넣는 일이 줄어듭니다.** 이 도구가 없는 쪽은 PR 설명에 두 번 모두 메모에 없는 테스트 체크리스트를 넣었습니다. 리뷰 코멘트에도 두 번 모두 보지 못한 코드를 가정한 예시 코드를 넣었습니다. 설치한 쪽은 PR 설명에 메모의 네 가지만 썼고 리뷰 코멘트에도 코드를 지어 넣지 않았습니다.
- **화면에 나오는 용어를 씁니다.** 이 도구가 없는 쪽은 Chrome 질문에 `확장 프로그램`과 함께 `확장 카드`, `확장` 같은 줄인 말도 썼고, 번역 요청에는 `pre-commit 훅`이라고 썼습니다. 설치한 쪽은 두 번 모두 `확장 프로그램`과 `pre-commit hook`으로만 썼습니다.
- **emoji와 가운뎃점이 빠집니다.** 이 도구가 없는 쪽은 7개 답변에 `:rotating_light:`, `⚠️`, `❌` 같은 emoji를 넣었고 3개 답변에 가운뎃점을 썼습니다. 설치한 쪽에서 나온 emoji는 Claude Code의 기본 지시에 따라 Claude가 PR 설명 끝에 붙이는 `🤖 Generated with [Claude Code]` 줄에 든 것 하나뿐입니다.
- **답변이 짧아집니다.** 답변 24개의 길이를 모두 더하면 19,271자에서 11,710자로 39% 줄었습니다.

## 이 도구의 특징

- **한국어를 쓸 때마다 skill을 거칩니다.** hook이 turn마다 Claude가 skill을 불렀는지 확인합니다. 부르지 않았다면 한국어 파일 쓰기와 커밋을 막습니다. 위 비교에서 설치한 쪽 답변 24개는 모두 skill을 거쳤습니다.
- **답변 말고도 Claude가 쓰는 한국어 전체를 봅니다.** Write나 Edit로 쓰는 문서와 소스 코드의 주석을 검사하고, `git commit` 메시지와 사용자에게 묻는 질문도 같은 규칙으로 검사합니다.
- **오류가 있는 글은 파일과 커밋에 남기 전에 막습니다.** Claude가 이런 글을 파일에 쓰거나 커밋하려 하면 hook이 실행 전에 막고 이유를 알려 줍니다. 커밋 메시지는 Git의 `commit-msg` hook으로도 검사하므로 Claude Code 밖에서 커밋해도 적용됩니다.
- **팀이 같은 규칙을 씁니다.** 검사 규칙(`.korean-style/rules.md`)은 저장소에 커밋하므로 clone한 팀원이 설치 명령을 한 번 실행하면 같은 규칙으로 검사합니다. 어투는 합니다체, 해요체, 혼용 가운데 고르고, 막을 표현과 표기는 규칙 문서에서 바꿉니다.
- **설치가 간단합니다.** Claude에게 저장소 주소를 주고 설치해 달라고 하면 됩니다. npm 패키지 의존성이 없고, 기존 `CLAUDE.md`와 설정, 다른 hook은 그대로 둡니다.

## 예시

아래 답변은 Claude가 쓴 그대로입니다. 요청마다 처음 받은 답변을 실었습니다.

### 장애 내용을 팀 슬랙에 공유할 요약 쓰기

**요청**

<!-- korean-style-quote -->
> 아래 장애 내용을 팀 슬랙 채널에 공유할 요약으로 써 줘.  
>
> Incident summary: At 14:05 the payment API started returning 502 errors. Root cause was a misconfigured connection pool. Max connections was set to 10 instead of 100 after yesterday's deploy. We rolled back at 14:32 and error rates returned to normal by 14:40. Around 3% of checkout requests failed during the window. Action items: add an alert on pool saturation, add a config validation step to the deploy pipeline.  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> 슬랙에 바로 붙여넣을 수 있게 슬랙 서식(`*굵게*`, `•` 글머리)으로 썼어요.  
>
> ---  
>
> :rotating_light: *[장애 공유] 결제 API 502 오류 (14:05 ~ 14:40)*  
>
> *요약*  
> 어제 배포 후 결제 API의 커넥션 풀 설정이 잘못되어 14:05부터 502 오류가 발생했습니다. 14:32에 롤백했고, 14:40에 오류율이 정상으로 돌아왔습니다.  
>
> *타임라인*  
> • 14:05 결제 API 502 오류 발생 시작  
> • 14:32 이전 버전으로 롤백  
> • 14:40 오류율 정상화 확인  
>
> *영향 범위*  
> • 장애 시간 약 35분 동안 체크아웃 요청의 약 3%가 실패했습니다.  
>
> *근본 원인*  
> • 어제 배포에서 커넥션 풀 최대 연결 수(max connections)가 *100이 아니라 10으로* 설정됐습니다.  
> • 트래픽이 많은 시간대에 풀이 가득 차서 요청을 처리하지 못했습니다.  
>
> *후속 조치*  
> • [ ] 커넥션 풀 포화도 알림 추가  
> • [ ] 배포 파이프라인에 설정값 검증 단계 추가  
>
> 질문이나 추가로 확인된 내용이 있으면 이 스레드에 남겨 주세요. :pray:  
>
> ---  
>
> 원문에 없는 내용은 넣지 않았어요. 담당자 이름, 기한, 장애 티켓 링크를 알려주시면 후속 조치 항목에 넣어 드릴게요.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> *[장애 공유] 결제 API 502 오류*  
>
> 14:05부터 결제 API가 502 오류를 반환했습니다. 14:32에 롤백했고, 14:40에 오류율이 정상으로 돌아왔습니다. 장애가 이어지는 동안 결제(checkout) 요청의 약 3%가 실패했습니다.  
>
> *원인*  
> 어제 배포 이후 connection pool의 최대 연결 수가 100이 아니라 10으로 잘못 설정되어 있었습니다.  
>
> *후속 조치 (예정)*  
> • connection pool이 포화되면 알림이 오도록 alert를 추가합니다.  
> • 배포 pipeline에 설정값을 검증하는 단계를 추가합니다.  
<!-- /korean-style-quote -->

이 도구가 없는 쪽은 슬랙에 붙여 넣을 수 있게 썼다는 해요체 머리말로 시작해 `:rotating_light:`, `:pray:` 같은 emoji 코드를 넣었습니다. 원문에 없는 `트래픽이 많은 시간대에 풀이 가득 차서`라는 설명을 덧붙였고, 끝에는 담당자와 기한을 알려 주면 넣어 주겠다는 제안을 붙였습니다. 설치한 쪽은 원문에 있는 시각, 원인, 영향, 후속 조치만 합니다체로 썼습니다.

### 영어 README 문단 번역하기

**요청**

<!-- korean-style-quote -->
> 다음 README 문단을 한국어로 옮겨 줘. 설명은 붙이지 마.  
>
> This tool allows you to run the same checks locally that our CI runs. Make sure Docker is running before you start. Results are written to the reports directory, and a summary is printed once all checks have completed. If a check fails, the exit code is set to 1 so that it can be used in pre-commit hooks.  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> 이 도구를 사용하면 CI에서 실행하는 것과 동일한 검사를 로컬에서 실행할 수 있습니다. 시작하기 전에 Docker가 실행 중인지 확인하세요. 결과는 reports 디렉터리에 저장되며, 모든 검사가 끝나면 요약이 출력됩니다. 검사가 실패하면 종료 코드가 1로 설정되므로 pre-commit 훅에서 활용할 수 있습니다.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> 이 도구를 쓰면 CI에서 돌리는 검사를 로컬에서도 똑같이 실행할 수 있습니다. 시작하기 전에 Docker가 실행 중인지 확인해 주십시오. 결과는 `reports` 디렉터리에 저장되고, 모든 검사가 끝나면 요약이 출력됩니다. 검사가 하나라도 실패하면 종료 코드가 1이 되므로 pre-commit hook에서도 쓸 수 있습니다.  
<!-- /korean-style-quote -->

이 도구가 없는 쪽은 합니다체 문단에 `확인하세요`를 섞었고, 영어 그대로 쓰는 `pre-commit hook`을 `pre-commit 훅`이라고 옮겼습니다. `the exit code is set to 1`은 영어 수동태를 따라 `종료 코드가 1로 설정되므로`라고 옮겼습니다. 설치한 쪽은 `확인해 주십시오`, `pre-commit hook`, `종료 코드가 1이 되므로`라고 썼습니다.

열두 가지 요청에 처음 받은 답변과 두 번째 답변에서 달라진 점은 모두 [설치 전후 예시](docs/examples.md)에 있습니다.

## 요청 열두 가지의 결과

| 요청 | 이 도구가 없는 프로젝트 | 이 도구를 설치한 프로젝트 |
| --- | --- | --- |
| Chrome extension 수정이 반영되지 않을 때 할 일 묻기 | 해요체가 섞인 답변, `확장 카드`라는 줄인 말 | `확장 프로그램`만 쓴 합니다체 답변 |
| 메모로 README 첫 단락 쓰기 | 메모 내용만 담은 단락 | 메모 내용만 담은 단락(차이 거의 없음) |
| 영어 README 문단 번역하기 | `확인하세요`, `pre-commit 훅` | `확인해 주십시오`, `pre-commit hook` |
| 장애 내용을 팀 슬랙에 공유할 요약 쓰기 | 해요체 머리말, emoji 코드, 끝에 붙인 제안 | 원문 내용만 담은 요약 |
| 메모로 PR 설명 쓰기 | 메모에 없는 테스트 체크리스트, `⚠️` | 메모의 네 가지만 담은 설명 |
| 배포 뒤 502가 날 때 어디부터 볼지 묻기 | 코드를 보지 못했다는 머리말, 해요체, 가운뎃점 | 같은 원인을 짚은 합니다체 답변, 3분의 2 길이 |
| 영어 구조를 따라 쓴 문단 다듬기 | 영어식 표현을 모두 고친 문단 | 영어식 표현을 모두 고친 문단(차이 없음) |
| PR 리뷰 코멘트 쓰기 | 머리말, 지어 넣은 예시 코드, `~것 같아요` | 두 문제와 고칠 방향만 담은 코멘트, 3분의 1 길이 |
| 커밋 메시지 쓰기 | 명사로 끝낸 항목, 다른 형식도 안내하는 해요체 끝맺음 | `feat:` 제목과 문장으로 쓴 항목 |
| 함수에 한국어 주석 달기 | 한다체 주석, 코드 밖에 덧붙인 설명 | 합니다체 주석만 |
| 쿠버네티스 Pod가 Pending인 이유 묻기 | 해요체가 섞인 설명, 표, 끝에 붙인 제안 | 같은 설명을 담은 합니다체 답변 |
| 이용자에게 보낼 점검 공지 쓰기 | `❌`를 넣은 표, 빈칸, 요청에 없는 정기결제 안내 | 공지 본문만 담은 답변, 요청에 없는 문장 하나 |

표에는 요청마다 두 답변 가운데 한 번 이상 나온 것을 적었습니다. 어느 답변에서 나왔는지는 [설치 전후 예시](docs/examples.md)에 있습니다.

| 항목 | 이 도구가 없는 프로젝트 | 이 도구를 설치한 프로젝트 |
| --- | --- | --- |
| skill을 거쳐 쓴 답변 | 24개 중 0개 | 24개 중 24개 |
| 검사기 오류가 나온 답변 | 24개 중 17개 | 24개 중 0개 |
| 해요체 어미가 들어간 답변 | 24개 중 19개 | 24개 중 0개 |
| 한 답변 안에서 합니다체와 해요체를 섞은 답변 | 24개 중 14개 | 24개 중 0개 |
| 앞에 머리말을 붙인 답변 | 24개 중 7개 | 24개 중 0개 |
| 끝에 제안이나 설명을 덧붙인 답변 | 24개 중 16개 | 24개 중 2개 |
| emoji가 들어간 답변 | 24개 중 7개 | 24개 중 1개 |
| 가운뎃점이 들어간 답변 | 24개 중 3개 | 24개 중 0개 |
| 답변 길이 합계 | 19,271자 | 11,710자 |
| 답변 하나를 받는 데 걸린 평균 시간 | 11.1초 | 15.2초 |
| 답변 하나의 평균 비용 | 0.046달러 | 0.086달러 |

검사기 오류는 이 저장소의 검사기로 셌고, 해요체와 머리말, 덧붙인 말, emoji, 가운뎃점은 답변을 하나씩 읽고 셌습니다. skill 호출과 시간, 비용은 평가 스크립트가 기록한 값입니다. 검사기는 `돼요`, `봐요`처럼 어간과 합쳐진 해요체 어미 가운데 일부를 잡지 못합니다. 그래서 커밋 메시지 요청에 받은 두 답변은 `돼요`로 끝나는 해요체 문장이 있는데도 검사기 오류가 나오지 않았습니다.
설치한 쪽은 답변하기 전에 skill을 불러 읽었고, 답변 7개에서는 검사기도 직접 실행했습니다. 그만큼 입력 토큰이 늘어 시간과 비용이 더 들었습니다.

요청은 [showcase.json](test/fixtures/eval/showcase.json)에 있습니다. 2026-10-18에 Claude Code 2.1.302에서 Claude Opus 5.5에 medium effort로, 요청마다 새 세션을 열어 보냈습니다. 같은 비교를 다시 하는 방법은 [개발](#개발)에 있습니다.

## 설치

이 도구를 쓸 프로젝트에서 Claude Code를 열고 이렇게 요청하면 됩니다.

> https://github.com/nerdkim/im-a-korean-ai-in-seoul 저장소를 읽고 이 프로젝트에 설치해 주십시오.

Claude는 아래 명령으로 설치합니다. 프로젝트 루트에서 직접 실행해도 됩니다.

```sh
npx -y github:nerdkim/im-a-korean-ai-in-seoul --target . --activate
node .korean-style/scripts/doctor.mjs
```

설치가 끝나면 Claude Code를 다시 시작합니다. skill과 hook은 새 세션부터 적용됩니다.

Node.js 20 이상(npm 포함), Git, Claude Code와 shell 환경(macOS, Linux 또는 WSL)이 필요합니다. npm 패키지 의존성은 없습니다.
npx를 쓸 수 없으면 저장소를 내려받아 설치 스크립트를 직접 실행합니다.

```sh
git clone --depth 1 https://github.com/nerdkim/im-a-korean-ai-in-seoul.git /tmp/im-a-korean-ai-in-seoul
node /tmp/im-a-korean-ai-in-seoul/scripts/install.mjs --target "$PWD" --activate
```

새 프로젝트라면 디렉터리를 만들고 그 안에서 실행합니다. Git을 쓴다면 설치하기 전에 `git init`을 실행합니다.

### 설치 옵션

| 옵션 | 설명 |
| --- | --- |
| `--target <경로>` | 이 도구를 설치할 프로젝트의 루트입니다. 반드시 지정합니다. |
| `--activate` | 프로젝트의 output-style을 `korean-style`로 지정합니다. 생략하면 다른 output-style이 선택되어 있을 때는 그 설정을 유지하고, 선택된 것이 없을 때만 `korean-style`로 지정합니다. |
| `--register <어투>` | skill과 작성 지침, 어투 검사에 쓸 어투입니다. `다나까체`(합니다체, 기본값), `해요체`, `혼용` 가운데 하나를 고릅니다. `혼용`이면 검사기는 두 어투를 모두 허용하고, skill과 작성 지침은 한 답변 안에서 어투를 하나로 맞추라고 지시합니다. |
| `--dry-run` | 파일을 쓰지 않고 규칙 갱신 여부, 어투, 커밋 hook 경로 같은 설치 결과만 미리 보여 줍니다. |
| `--force` | 직접 수정한 규칙을 새 기본값으로 교체합니다. 교체하기 전에 백업합니다. |

답변과 문서, 주석, 커밋 메시지의 어투를 해요체로 맞추려면 설치 명령에 `--register 해요체`를 붙여 실행합니다.

설치 스크립트는 기존 `CLAUDE.md`, 다른 hook, 권한, MCP 설정, 다른 output-style 파일을 그대로 둡니다.
`.claude/settings.json`에는 hook 세 개를 더하고 필요할 때만 `outputStyle`을 바꿉니다. 사용자 전역 설정과 `.claude/settings.local.json`은 바꾸지 않습니다.
설정 파일이 손상되었거나 설치 경로에 symlink가 있으면 덮어쓰지 않고 멈춥니다. 처음 설치할 때 skill이나 output-style을 놓을 경로에 파일이 이미 있어도 멈춥니다.

## 설치되는 구성 요소

| 구성 요소 | 하는 일 |
| --- | --- |
| `korean-rewrite` skill | Claude가 한국어를 쓰기 전에 따르는 절차입니다. 영어를 낱말 단위로 옮긴 표현, 메모처럼 끊은 문장, 묻지 않은 제안 같은 습관을 실제 예시로 짚고, 그런 글을 고쳐 쓰게 합니다. |
| UserPromptSubmit hook | 사용자가 프롬프트를 보낼 때마다 이 skill을 먼저 부르라고 Claude에게 알립니다. |
| PreToolUse hook | skill을 부르지 않은 채 한국어 파일을 쓰거나 커밋하려 하면 막습니다. 금지 문자나 다른 어투가 섞인 파일 쓰기와 커밋도 막습니다. |
| Stop hook | skill을 거치지 않았거나 오류가 있는 한국어 답변을 한 번 다시 쓰게 합니다. |
| 작성 지침(output-style) | Claude Code가 system prompt에 넣는 어투와 기본 원칙입니다. |
| `commit-msg` Git hook | 어떤 프로그램으로 커밋하든 커밋 메시지를 검사합니다. |
| `korean-style` skill | 검사 규칙을 확인하거나 바꿀 때 씁니다. |

기술 용어를 영어로 써도 검사기는 막지 않습니다. 기본 규칙에서 오류로 막는 것은 정한 어투와 다른 어미, 산문에 쓴 가운뎃점과 em dash와 emoji 같은 금지 문자, 틀린 외래어 표기, 오타 등입니다. 영어식 표현과 긴 문장은 경고만 합니다. 규칙의 전체 목록은 [검사 규칙](docs/rules.md)에 있습니다.

### 설치되는 파일

| 경로 | 내용 | Git |
| --- | --- | --- |
| `.korean-style/rules.md` | 이 프로젝트의 검사 규칙 | 커밋 |
| `.korean-style/defaults.sha256` | 기본 규칙을 수정했는지 판별하는 값 | 커밋 |
| `.korean-style/scripts/` | 검사기, hook, doctor | 제외 |
| `.korean-style/docs/` | 기본 규칙 사본과 제약 문서 | 제외 |
| `.claude/skills/korean-rewrite/SKILL.md` | 한국어 작성 skill | 제외 |
| `.claude/skills/korean-style/SKILL.md` | 검사 규칙 skill | 제외 |
| `.claude/output-styles/korean-style.md` | 작성 지침 | 제외 |
| `.claude/settings.json` | hook 세 개와 `outputStyle` 설정 | 커밋 |
| `.gitignore` | 위에서 제외로 표시한 항목 | 커밋 |
| `.git/hooks/commit-msg` | 커밋 메시지 검사 | 해당 없음 |

제외로 표시한 파일은 Git에 올리지 않고 설치할 때마다 새로 만듭니다. 그래서 저장소를 clone한 팀원도 설치 명령을 한 번 실행해야 합니다.

## 사용법

설치한 뒤에는 따로 할 일이 없습니다. Claude가 한국어를 쓸 때마다 skill을 부르고, hook이 그 결과를 검사합니다.
skill을 직접 부르려면 메시지 맨 앞에 `/`와 skill 이름을 입력합니다.

| skill | 용도 | 예 |
| --- | --- | --- |
| `korean-rewrite` | 한국어 글을 쓰거나 다듬고, 영어 문서를 한국어로 옮깁니다 | `/korean-rewrite docs/guide.md를 자연스러운 한국어로 다듬어 주십시오` |
| `korean-style` | 검사 규칙을 확인하거나 어색한 표현을 진단합니다 | `/korean-style README.md에서 어색한 표현을 찾아 주십시오` |

### hook이 하는 일

| 시점 | 보는 것 | 하는 일 |
| --- | --- | --- |
| 사용자가 프롬프트를 보낼 때 | 없음 | skill을 먼저 부르라고 Claude에게 알립니다 |
| Claude Code가 도구를 실행하기 직전 | 파일에 쓸 내용(Write, Edit 등), 사용자에게 묻는 질문, 승인받을 계획, subagent 프롬프트, Bash로 실행하는 `git commit`의 메시지 | 오류가 있거나 skill을 부르지 않은 채 한국어를 쓰면 실행을 막고 이유를 알려 줍니다 |
| Claude Code가 답변을 마칠 때 | 이번 turn의 최종 답변 | skill을 거치지 않았거나 오류가 있으면 한 번 다시 쓰게 합니다 |
| Git이 커밋할 때(`commit-msg` hook) | 커밋 메시지 | 오류가 있으면 커밋을 멈춥니다 |

subagent 프롬프트는 영어로 써도 되므로 hook은 skill을 요구하지 않고 오류만 봅니다. 한글이 20자보다 적은 짧은 글에도 skill을 요구하지 않습니다. 이 기준은 규칙 문서의 `writing-skill-min-hangul`로 바꿉니다.
파일 쓰기에 오류는 없고 영어식 표현 같은 경고만 있으면 쓰기를 막지 않습니다. 다만 `review-rules`에 든 규칙의 경고가 이번에 바꾼 문단에서 새로 생겼다면 hook이 그 경고를 Claude에게 알립니다.
Claude가 shell 명령으로 검사 대상 파일에 직접 쓰면 그 내용은 검사를 거치지 않습니다. 그래서 hook은 이런 명령을 감지하면 막고 Write나 Edit 도구로 다시 쓰라고 안내합니다.
Stop hook은 답변이 화면에 표시된 뒤에 검사하므로 이미 표시된 답변은 되돌리지 못합니다. hook 실행 중에 예외가 발생하면 작업을 막지 않고 통과시킵니다.
skill을 요구하는 조건과 예외는 [검사 규칙](docs/rules.md#한국어를-쓰기-전에-부르는-skill)에, 내부 동작은 [동작 원리](docs/how-it-works.md)에 있습니다.

### 검사기 CLI

```sh
node .korean-style/scripts/check-korean.mjs --text '확인했습니다.'
node .korean-style/scripts/check-korean.mjs --file docs/guide.md
node .korean-style/scripts/check-korean.mjs --all
node .korean-style/scripts/check-korean.mjs --explain translationese
```

`--stdin`으로 표준 입력을 검사할 수 있고, `--target chat|doc|comment|commit`으로 글의 종류를 지정할 수 있습니다. 설치 스크립트의 `--target <경로>`와는 다른 옵션입니다.
오류가 있으면 종료 코드는 1이고, 사용법이 틀리면 2입니다. 경고만 있으면 0이며 `--strict`를 주면 1입니다.
검사기는 파일을 자동으로 고치지 않습니다. 기존 문서에 오류가 있어도 설치가 실패한 것은 아닙니다.

## 규칙 바꾸기

`.korean-style/rules.md`의 `korean-style-rules` 블록을 고칩니다. 차단하지 않고 경고만 할 규칙은 `advisory-rules`에 넣습니다. skill을 요구하지 않으려면 `writing-skill`을 비웁니다.
각 키의 뜻은 [검사 규칙](docs/rules.md)에 있습니다.
규칙을 고친 뒤에는 잡아야 할 문장과 통과해야 할 문장을 `--text`로 함께 확인합니다.

문서에 다른 사람이나 모델이 쓴 글을 그대로 옮겨 적을 때는 그 글을 `<!-- korean-style-quote -->` 줄과 `<!-- /korean-style-quote -->` 줄 사이에 넣습니다. 검사기는 문서에서 이 구간을 검사하지 않고, 답변과 커밋 메시지에서는 검사합니다. [설치 전후 예시](docs/examples.md)에 실은 Claude의 답변도 이렇게 옮겨 적었습니다.

## 갱신과 팀 공유

같은 설치 명령을 다시 실행하면 검사기와 skill, 작성 지침을 최신으로 바꿉니다. hook을 중복으로 추가하지 않으며, `--register`를 주지 않으면 기존 어투를 유지합니다.
규칙을 수정하지 않았다면 새 기본값을 적용합니다. 직접 수정한 규칙은 그대로 두고, 수정했는지 판별할 수 없는 구버전 규칙도 그대로 둡니다.
새 기본값으로 바꾸려면 `--force`를 추가합니다. 기존 규칙은 `.korean-style/rules.backup-*.md`에 백업하므로 필요한 내용을 옮겨 올 수 있습니다.

Git worktree와 `core.hooksPath`를 지원합니다. 여러 checkout이 함께 쓰는 커밋 hook도 커밋하는 checkout의 규칙을 따릅니다.
이미 다른 `commit-msg` hook이 있으면 덮어쓰지 않습니다. 함께 쓰려면 기존 hook에서 다음 명령을 호출합니다.

```sh
node .korean-style/scripts/hooks/commit-msg.mjs "$1" || exit $?
```

Git 없이 설치해도 Claude Code hook은 동작합니다. 나중에 `git init`을 실행하고 다시 설치하면 `.gitignore` 항목과 커밋 hook을 추가합니다.

## 제거

1. `.korean-style/`, `.claude/skills/korean-style/`, `.claude/skills/korean-rewrite/`, `.claude/output-styles/korean-style.md`를 지웁니다.
2. `.claude/settings.json`에서 명령에 `.korean-style/scripts/hooks/`가 들어간 hook 항목과 `"outputStyle": "korean-style"`을 지웁니다.
3. `.gitignore`에서 `# korean-style`로 시작하는 줄과 이 도구가 추가한 여섯 줄(`.korean-style/*`, `!.korean-style/rules.md`, `!.korean-style/defaults.sha256`, `.claude/skills/korean-style/`, `.claude/skills/korean-rewrite/`, `.claude/output-styles/korean-style.md`)을 지웁니다.
4. `git rev-parse --git-path hooks/commit-msg`가 가리키는 파일에 `korean-style commit hook`이 들어 있는 줄이 있으면 그 파일을 지웁니다. 기존 hook에 검사기 호출을 직접 추가했다면 그 줄도 지웁니다.

## 문제 해결

먼저 `node .korean-style/scripts/doctor.mjs`로 설치 상태를 확인합니다. 실패 항목이 있으면 종료 코드 1로 끝납니다.

- **skill이나 hook이 적용되지 않을 때:** Claude Code를 다시 시작했는지 확인합니다. 그다음 `.claude/settings.local.json`의 `outputStyle`과 `disableAllHooks`를 확인합니다. worktree에서는 main worktree의 로컬 설정도 확인합니다. 적용 순서는 Claude Code의 [설정 우선순위](https://code.claude.com/docs/en/settings#settings-precedence)를 따릅니다.
- **조직 정책, 세션 옵션, 사용자 전역 설정을 확인할 때:** `doctor`는 프로젝트와 로컬 설정 파일만 읽습니다. Claude Code의 `/status`에서 실제 설정 출처를 확인합니다.
- **주의 항목이 나올 때:** 다른 커밋 hook을 쓰거나 커밋해야 할 파일이 Git에서 제외되어 있으면 `doctor`가 주의 항목으로 표시합니다.
- **설치가 멈출 때:** 손상된 설정 파일을 고치고, 같은 이름의 기존 파일이나 설치 경로의 symlink를 옮기거나 지운 뒤 다시 설치합니다.

## 다른 코딩 agent

skill과 hook, 작성 지침은 Claude Code에서만 동작합니다. Codex나 Gemini CLI에서는 적용되지 않습니다.
커밋 메시지 검사는 Git hook으로 동작하므로 어떤 프로그램으로 커밋해도 적용됩니다.
같은 기준을 따르게 하려면 한국어를 쓰기 전에 `.claude/skills/korean-rewrite/SKILL.md`를 읽고 그 절차를 따르라는 지시를 `AGENTS.md`나 `GEMINI.md`에 적습니다.

## 개발

이 저장소를 고칠 때는 `CLAUDE.md`를 따릅니다. `AGENTS.md`와 `GEMINI.md`는 `CLAUDE.md`를 가리키는 symlink입니다.
한국어 산문을 바꾸면 커밋하기 전에 `korean-reviewer` agent(`.claude/agents/korean-reviewer.md`)로 diff와 커밋 메시지를 검토합니다.

```sh
npm run gate                    # 자체 검사, 회귀 테스트, 문체 검사
npm run doctor                  # 이 저장소의 설정 확인
npm run eval -- --run           # 설치 전후 답변 비교, 유료 API 호출
```

일반 테스트는 API를 호출하지 않습니다. 평가 스크립트는 기본적으로 임시 프로젝트에서 `low` effort로 요청을 묶어 보냅니다.
`--individual`을 주면 요청마다 새 세션을 씁니다. `--with-hooks`를 주면 두 임시 프로젝트 가운데 한쪽에만 이 도구를 설치해 hook과 skill이 실제로 동작하게 하고, 응답마다 Claude가 부른 skill을 기록합니다. 이때 두 프로젝트 모두에서 Claude가 Skill 도구를 쓰고 검사기를 실행할 수 있게 합니다.
위의 설치 전후 비교는 아래 명령으로 다시 할 수 있습니다. 유료 API를 호출하며, 답변은 `.eval/latest/results.json`에 저장됩니다.

```bash
npm run eval -- --run --cases test/fixtures/eval/showcase.json --models claude-opus-5-5 --effort medium --repeat 2 --individual --with-hooks
```

`--cases test/fixtures/eval/regression.json`처럼 입력을 고를 수 있습니다. `calque.json`은 한국어로 옮기면 영어식 표현이 나오기 쉬운 영어 문장을 모은 입력이고, `showcase.json`은 위의 설치 전후 비교에 쓴 요청 열두 가지입니다. 평가 스크립트는 사례마다 `mustNot`에 적은 표현이 응답에 나오면 제약 위반으로 셉니다.
다시 실행할 때는 `--out .eval/run2`처럼 새 경로를 지정합니다. [평가 입력](test/fixtures/eval/)만 Git에 두고 실행 결과는 커밋하지 않습니다.
원문과 응답은 함께 놓고 검토합니다.

[korean-rewrite skill](skill/korean-rewrite/SKILL.md), [작성 지침](output-styles/korean-style.md), [검사 규칙](docs/rules.md), [동작 원리](docs/how-it-works.md), [제약](docs/limits.md), [설치 전후 예시](docs/examples.md)에 세부 내용이 있습니다.

## 라이선스

[MIT](LICENSE)
