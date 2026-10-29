# 설치와 사용

## 설치

이 도구를 쓸 프로젝트에서 Claude Code를 열고 이렇게 요청하면 Claude가 저장소를 읽고 설치합니다.

> https://github.com/nerdkim/im-a-korean-ai-in-seoul 저장소를 읽고 이 프로젝트에 설치해 주십시오.

직접 설치하려면 프로젝트 루트에서 다음 명령을 실행합니다.

```sh
npx -y github:nerdkim/im-a-korean-ai-in-seoul --target . --activate
node .korean-style/scripts/doctor.mjs
```

npx를 쓸 수 없으면 저장소를 내려받아 설치 스크립트를 직접 실행합니다.

```sh
git clone --depth 1 https://github.com/nerdkim/im-a-korean-ai-in-seoul.git /tmp/im-a-korean-ai-in-seoul
node /tmp/im-a-korean-ai-in-seoul/scripts/install.mjs --target "$PWD" --activate
```

설치한 뒤에는 Claude Code를 다시 시작해야 합니다. skill과 hook은 새 세션부터 적용됩니다.
Node.js 20 이상과 npm, Git, Claude Code가 필요합니다. 명령은 macOS, Linux, WSL의 shell에서 실행해야 합니다. 설치할 npm 패키지는 없습니다.
새 프로젝트라면 먼저 디렉터리를 만듭니다. Git을 쓴다면 그 디렉터리에서 `git init`부터 실행합니다. 프로젝트 루트에 `.git`이 없으면 설치 스크립트는 `.gitignore` 항목과 `commit-msg` hook을 추가하지 않습니다.

### 설치 옵션

| 옵션 | 설명 |
| --- | --- |
| `--target <경로>` | 이 도구를 설치할 프로젝트의 루트입니다. 반드시 지정합니다. |
| `--activate` | 프로젝트 설정의 output-style을 `korean-style`로 바꿉니다. 이 옵션이 없으면 이미 고른 output-style은 그대로 두고 고른 것이 없을 때만 `korean-style`을 고릅니다. |
| `--register <말투>` | Claude가 쓸 말투입니다. `합니다체`(기본값), `해요체`, `혼용` 가운데 하나를 고릅니다. `혼용`이면 검사기는 두 말투를 모두 받아들입니다. 대신 skill과 작성 지침에는 답변 하나 안에서는 처음 쓴 말투를 끝까지 지키라는 지시가 들어 있습니다. 0.3.0까지 쓰던 이름인 `다나까체`를 주면 `합니다체`를 고른 것과 같습니다. 이 옵션 없이 다시 설치하면 규칙 문서에 적힌 말투 이름을 그대로 둡니다. |
| `--dry-run` | 파일은 쓰지 않습니다. 규칙을 새 기본값으로 바꿀지, 어떤 말투를 쓸지, `commit-msg` hook을 어디에 둘지 미리 보여 줍니다. |
| `--force` | 직접 고친 규칙 문서를 새 기본 규칙으로 바꿉니다. 바꾸기 전에 원래 규칙을 백업합니다. |

### 설치되는 파일

| 경로 | 내용 | Git |
| --- | --- | --- |
| `.korean-style/rules.md` | 규칙 문서 | 커밋 |
| `.korean-style/defaults.sha256` | 규칙을 직접 고쳤는지 알아보는 데 쓰는 값 | 커밋 |
| `.korean-style/scripts/` | 검사기, hook, doctor | 제외 |
| `.korean-style/docs/` | 기본 규칙 사본과 제약 문서 | 제외 |
| `.claude/skills/korean-rewrite/SKILL.md` | 한국어 작성 skill | 제외 |
| `.claude/skills/korean-style/SKILL.md` | 검사 규칙 skill | 제외 |
| `.claude/output-styles/korean-style.md` | 작성 지침 | 제외 |
| `.claude/settings.json` | hook 세 개, `outputStyle`, `attribution`, `env` 설정 | 커밋 |
| `.gitignore` | 위에서 제외로 표시한 항목 | 커밋 |
| `.worktreeinclude` | `claude --worktree`로 만든 작업 트리에 복사할 제외 항목 | 커밋 |
| `.git/hooks/commit-msg` | 커밋 메시지 검사 | 해당 없음 |

제외로 표시한 파일은 설치할 때마다 새로 만듭니다. 그래서 저장소를 clone한 팀원도 설치 명령을 한 번 실행해야 합니다.
설치 명령을 실행하기 전에는 hook이 검사를 하지 않습니다. 대신 프롬프트를 보낼 때마다 Claude에게 안내를 남겨, 사용자에게 설치 명령을 다시 실행해 달라고 알리게 합니다.
`claude --worktree`로 작업 트리를 만들면 Claude Code가 `.worktreeinclude`에 적힌 제외 파일을 복사합니다. 그래서 그 작업 트리에서는 다시 설치하지 않아도 됩니다. `git worktree add`로 만든 작업 트리에서는 설치 명령을 다시 실행해야 합니다.

설치 스크립트는 `.claude/settings.json`에 hook 세 개를 추가합니다. `attribution`에 `commit`이나 `pr` 값이 없으면 빈 값을 넣어 Claude Code가 `Co-Authored-By: Claude` 줄과 `Generated with [Claude Code]` 줄을 붙이지 않게 합니다. `env`에 `CLAUDE_CODE_THINKING_DISPLAY_UPDATES` 값이 없으면 `0`을 넣어 서버가 요약한 진행 보고가 화면에 나오지 않게 합니다. 설치 스크립트는 `attribution`과 `env`에서 프로젝트가 이미 정해 둔 값을 바꾸지 않습니다. `outputStyle`은 위 `--activate` 설명대로 바꿉니다.
기존 `CLAUDE.md`, 다른 hook, 권한, MCP 설정, 다른 output-style 파일, 사용자 전역 설정, `.claude/settings.local.json`은 바꾸지 않습니다.
설정 파일이 손상되었거나 설치 경로에 symlink가 있으면 아무것도 덮어쓰지 않고 멈춥니다. 처음 설치할 때 skill이나 작성 지침을 놓을 경로에 같은 이름의 파일이 있어도 멈춥니다.

## 쓰는 법

Claude Code를 다시 시작한 뒤에는 따로 할 일이 없습니다. Claude는 한국어를 쓸 때마다 먼저 skill을 부릅니다. hook은 Claude가 쓴 글을 검사합니다.
skill을 직접 부르려면 메시지 맨 앞에 `/`와 skill 이름을 입력합니다.

| skill | 쓰는 곳 | 예 |
| --- | --- | --- |
| `korean-rewrite` | 한국어 글을 쓰거나 다듬을 때, 영어 문서를 한국어로 옮길 때 | `/korean-rewrite docs/guide.md를 자연스러운 한국어로 다듬어 주십시오` |
| `korean-style` | 검사 규칙을 확인하거나 표현이 어색한 이유를 찾을 때 | `/korean-style README.md에서 어색한 표현을 찾아 주십시오` |

### hook이 하는 일

| 시점 | 보는 글 | 하는 일 |
| --- | --- | --- |
| 사용자가 프롬프트를 보낼 때 | 없음 | 한국어를 쓰기 전에 skill을 부르고 처음부터 한국어로 생각하라고 Claude에게 알립니다. |
| Claude Code가 도구를 실행하기 직전 | 파일에 쓸 내용, 사용자에게 묻는 질문, 승인받을 계획, 사용자에게 보내는 파일 설명, subagent 프롬프트, `git commit` 메시지, `gh pr`과 `gh issue`로 올리는 제목과 설명 | 오류가 있거나 skill을 부르지 않고 한국어를 쓰면 실행을 막고 이유를 알려 줍니다. |
| Claude Code가 답변을 마칠 때 | 최종 답변 | skill을 거치지 않았거나 오류가 있으면 한 번 다시 쓰게 합니다. |
| Git이 커밋할 때(`commit-msg` hook) | 커밋 메시지 | 오류가 있으면 커밋을 멈춥니다. |

subagent 프롬프트는 영어로 써도 되므로 hook은 skill을 요구하지 않고 오류만 봅니다. 한글이 20자보다 적은 글에도 skill을 요구하지 않습니다. 이 기준을 바꾸려면 규칙 문서의 `writing-skill-min-hangul` 값을 고칩니다.
파일에 쓸 내용에 오류가 없고 경고만 있으면 쓰기를 막지 않습니다. 다만 이번에 바꾼 문단에서 `review-rules`에 든 규칙의 경고가 새로 나오면 hook이 Claude에게 알려 다시 살펴보게 합니다.
Claude가 shell 명령으로 검사하는 파일에 쓰려 하면 hook은 쓸 내용을 미리 볼 수 없습니다. 그래서 이런 명령을 막고 Write나 Edit 도구로 다시 쓰라고 안내합니다.
Stop hook은 답변이 화면에 나온 뒤에 실행되므로 이미 나온 답변을 되돌리지 못합니다. hook을 실행하다 예외가 나면 작업은 그대로 계속됩니다.
skill을 요구하는 조건과 내부 동작은 [동작 원리](how-it-works.md)에 있습니다.

### 검사기 CLI

```sh
node .korean-style/scripts/check-korean.mjs --text '확인했습니다.'
node .korean-style/scripts/check-korean.mjs --file docs/guide.md
node .korean-style/scripts/check-korean.mjs --all
node .korean-style/scripts/check-korean.mjs --explain translationese
```

`--stdin`으로 표준 입력을 검사하고 `--target chat|doc|comment|commit`으로 글의 종류를 정합니다. 설치 스크립트의 `--target <경로>`와는 다른 옵션입니다.
오류가 있으면 종료 코드 1, 사용법이 틀리면 2로 끝납니다. 경고만 있으면 0이고 `--strict`를 주면 경고만 있어도 1입니다.
검사기는 파일을 고치지 않습니다. 기존 문서에서 오류가 나와도 설치가 실패한 것은 아닙니다.

## 규칙 바꾸기

`.korean-style/rules.md`의 `korean-style-rules` 블록을 고칩니다. 막지 않고 경고만 할 규칙은 `advisory-rules`에 넣습니다. skill을 요구하지 않으려면 `writing-skill:`의 값을 비웁니다. 생성 표시를 막지 않으려면 `banned-attribution:`의 값을 비웁니다.
키마다 뜻은 [검사 규칙](rules.md)에 있습니다. 규칙을 고친 뒤에는 잡아야 할 문장과 통과해야 할 문장을 `--text`로 함께 확인합니다.

문서에 다른 사람이나 모델이 쓴 글을 그대로 옮길 때는 그 글을 `<!-- korean-style-quote -->` 줄과 `<!-- /korean-style-quote -->` 줄 사이에 넣습니다. 검사기는 문서에서 이 사이를 검사하지 않습니다. 답변과 커밋 메시지에서는 이 사이도 검사합니다.

## 다시 설치하기와 팀에서 쓰기

같은 설치 명령을 다시 실행하면 검사기, skill, 작성 지침이 최신으로 바뀝니다. `git clone`으로 설치했다면 `/tmp/im-a-korean-ai-in-seoul`을 지운 뒤 `git clone`부터 다시 실행합니다. hook은 겹쳐 들어가지 않습니다. `--register`를 주지 않으면 지금 쓰는 말투가 그대로 남습니다.
규칙 문서를 고치지 않았다면 새 기본 규칙이 들어갑니다. 직접 고친 규칙과, 고쳤는지 알 수 없는 예전 규칙은 그대로 둡니다. 새 기본 규칙으로 바꾸려면 `--force`를 붙입니다. 원래 규칙은 `.korean-style/rules.backup-*.md`에 백업되므로 필요한 내용을 옮겨 올 수 있습니다.
규칙 문서(`.korean-style/rules.md`)는 저장소에 커밋하는 파일입니다. 저장소를 clone한 팀원이 설치 명령을 한 번 실행하면 같은 규칙이 적용됩니다.
아직 0.3.0을 쓰는 팀원이 있으면 `--register` 없이 다시 설치합니다. 그러면 규칙 문서의 `다나까체`가 그대로 남습니다. 새 검사기와 0.3.0 검사기는 모두 이 이름을 읽습니다.

Git worktree와 `core.hooksPath`도 지원합니다. 여러 작업 트리가 `commit-msg` hook 하나를 함께 쓰더라도 hook은 지금 커밋하는 작업 트리의 규칙을 따릅니다.
다른 `commit-msg` hook이 이미 있으면 설치 스크립트는 그 hook을 덮어쓰지 않습니다. 이때 사람이 직접 하거나 다른 프로그램으로 하는 커밋도 검사하려면 기존 hook에 다음 줄을 넣습니다.

```sh
node .korean-style/scripts/hooks/commit-msg.mjs "$1" || exit $?
```

Git 저장소가 아닌 프로젝트에 설치해도 Claude Code hook은 동작합니다. 나중에 `git init`을 실행하고 다시 설치하면 `.gitignore` 항목과 `commit-msg` hook이 추가됩니다.

## 제거

1. `.korean-style/`, `.claude/skills/korean-style/`, `.claude/skills/korean-rewrite/`, `.claude/output-styles/korean-style.md`를 지웁니다.
2. `.claude/settings.json`에서 명령에 `.korean-style/scripts/hooks/`가 든 hook 항목과 `"outputStyle": "korean-style"`을 지웁니다. `attribution` 항목과 `env`의 `CLAUDE_CODE_THINKING_DISPLAY_UPDATES` 항목은 이 도구가 넣었으면 지웁니다.
3. `.gitignore`에서 `# korean-style`로 시작하는 줄과 그 아래 여섯 줄(`.korean-style/*`, `!.korean-style/rules.md`, `!.korean-style/defaults.sha256`, `.claude/skills/korean-style/`, `.claude/skills/korean-rewrite/`, `.claude/output-styles/korean-style.md`)을 지웁니다.
4. `git rev-parse --git-path hooks/commit-msg`가 가리키는 파일에 `korean-style commit hook`이 든 줄이 있으면 그 파일을 지웁니다. 기존 hook에 검사기 호출을 직접 넣었다면 그 줄도 지웁니다.

## 문제 해결

먼저 `node .korean-style/scripts/doctor.mjs`로 설치 상태를 확인합니다. 실패한 항목이 있으면 종료 코드 1로 끝납니다.

- **skill, 작성 지침, hook이 적용되지 않을 때:** Claude Code를 다시 시작했는지 확인합니다. 그다음 `.claude/settings.local.json`의 `outputStyle`과 `disableAllHooks`를 확인합니다. worktree에서는 main worktree의 로컬 설정도 확인합니다. 어느 설정이 우선하는지는 Claude Code 문서의 [설정 우선순위](https://code.claude.com/docs/en/settings#settings-precedence)에 나와 있습니다.
- **조직 정책, 세션 옵션, 사용자 전역 설정이 의심될 때:** `doctor`는 프로젝트 설정과 로컬 설정 파일만 읽습니다. 실제로 적용된 설정은 Claude Code의 `/status`로 확인합니다.
- **주의 항목이 나올 때:** 다른 `commit-msg` hook을 쓰거나, 커밋해야 할 파일이 Git에서 빠져 있거나, 생성 표시나 진행 보고 요약이 켜져 있으면 `doctor`가 주의 항목으로 표시합니다.
- **설치가 멈출 때:** 손상된 설정 파일을 고치고 같은 이름의 기존 파일이나 설치 경로의 symlink를 옮기거나 지운 뒤 다시 설치합니다.

## 다른 코딩 agent

Codex나 Gemini CLI에서는 skill과 작성 지침, Claude Code hook이 동작하지 않습니다.
커밋 메시지 검사는 Git의 `commit-msg` hook에서 실행되므로 어느 프로그램으로 커밋하든 적용됩니다.
다른 agent도 같은 기준을 따르게 하려면 `AGENTS.md`나 `GEMINI.md`에 지시를 적어 둡니다. 한국어를 쓰기 전에 `.claude/skills/korean-rewrite/SKILL.md`를 읽고 그 순서를 따르라고 적습니다.
