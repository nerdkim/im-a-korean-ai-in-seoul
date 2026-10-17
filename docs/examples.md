# 설치 전후 예시

같은 요청을 이 도구가 없는 프로젝트와 이 도구를 설치한 프로젝트에서 Claude에게 보내고, 받은 답변을 고치지 않고 옮겼습니다.

- 2026-10-18에 Claude Code 2.1.302에서 Claude Opus 5.5에 medium effort로 보냈습니다. 요청마다 새 세션을 열었습니다.
- 요청 열두 가지는 [showcase.json](../test/fixtures/eval/showcase.json)에 있습니다. 요청마다 두 번씩 보냈고, 여기에는 처음 받은 답변을 실었습니다. 두 번째 답변에서 달랐던 점은 `달라진 점`에 함께 적었습니다.
- 설치한 프로젝트에서 Claude는 답변 24개를 쓸 때마다 먼저 `korean-rewrite` skill을 불렀습니다.
- 요청과 받은 답변은 `<!-- korean-style-quote -->` 줄과 `<!-- /korean-style-quote -->` 줄 사이에 인용으로 넣었습니다. 검사기는 이 구간을 검사하지 않습니다.

## 1. Chrome extension 수정이 반영되지 않을 때 할 일 묻기

**요청**

<!-- korean-style-quote -->
> Chrome extension을 만들고 있어. Profile 11 프로필에 개발용으로 올려 두고 테스트하는데, 방금 content script랑 manifest를 고쳤는데도 예전 동작 그대로야. 내가 뭘 하면 되는지 짧게 알려 줘.  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> Chrome은 unpacked 확장 파일이 바뀌어도 자동으로 다시 읽지 않습니다. 아래 순서대로 해 보세요.  
>
> 1. **확장 프로그램 다시 로드**: Profile 11 창에서 `chrome://extensions`를 열고, 해당 확장 카드의 새로고침(↻) 버튼을 누릅니다. manifest를 고쳤다면 이 단계가 꼭 필요합니다.  
> 2. **테스트 중인 페이지 새로고침**: 이미 열려 있는 탭에는 예전 content script가 그대로 남아 있습니다. 확장을 다시 로드한 뒤 탭을 새로고침(F5)해야 새 스크립트가 들어갑니다.  
> 3. **로드 경로 확인**: 확장 카드의 "세부정보"에서 소스 경로가 지금 수정하고 있는 폴더인지 봅니다. 빌드 도구를 쓴다면 `dist/` 같은 출력 폴더를 로드했을 수 있으니, 다시 빌드했는지도 확인합니다.  
> 4. **올바른 프로필인지 확인**: 지금 보고 있는 창이 Profile 11 창인지 확인합니다. 다른 프로필 창에서는 변경 사항이 보이지 않습니다.  
> 5. **오류 확인**: 확장 카드에 "오류" 버튼이 있으면 눌러 봅니다. manifest에 오류가 있으면 Chrome이 새 버전을 적용하지 못할 수 있습니다.  
>
> 그래도 그대로라면 확장을 "삭제"한 뒤 "압축해제된 확장 프로그램 로드"로 다시 올려 보세요. 그러면 거의 해결됩니다.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> Chrome에서 Profile 11 창을 열고 `chrome://extensions`로 이동한 뒤, 해당 확장 프로그램 카드의 새로고침 아이콘을 눌러 주십시오. manifest를 고쳤다면 이렇게 확장 프로그램을 다시 불러와야 바뀐 내용이 적용됩니다.  
>
> 그다음 테스트하던 웹페이지 탭도 새로고침해 주십시오. 이미 열린 탭에는 예전 content script가 남아 있으므로, 페이지를 다시 불러와야 새 스크립트가 들어갑니다.  
>
> 그래도 예전 동작이 그대로라면 두 가지를 확인해 주십시오.  
>
> - 카드에 `오류` 버튼이 보이면 manifest를 읽다가 실패한 것입니다. 눌러서 메시지를 확인해 주십시오.  
> - 카드의 `세부정보`에서 로드된 폴더 경로를 확인해 주십시오. 빌드 도구를 쓴다면 이 경로가 소스 폴더가 아닌 빌드 결과물 폴더일 수 있습니다. 그런 경우에는 다시 빌드한 뒤 새로고침해야 합니다.  
<!-- /korean-style-quote -->

**달라진 점**

- 이 도구가 없는 쪽의 첫 번째 답변은 합니다체 사이에 `해 보세요`와 `올려 보세요`라는 해요체를 섞었습니다. 두 번째 답변은 처음부터 해요체로 썼습니다. 설치한 쪽은 두 번 모두 합니다체로 썼습니다.
- 이 도구가 없는 쪽은 두 번 모두 `확장 프로그램`과 함께 `확장 카드`처럼 줄인 말도 썼습니다. 설치한 쪽은 두 번 모두 Chrome 화면에 나오는 대로 `확장 프로그램`이라고만 썼습니다.

## 2. 메모로 README 첫 단락 쓰기

**요청**

<!-- korean-style-quote -->
> 아래 메모로 README 첫 단락을 써 줘. 제목은 빼고 본문만 써 줘.  
>
> - logsieve: 로그 파일에서 오류 줄만 골라 원인별로 묶어 주는 CLI  
> - Node.js 20 이상  
> - npx logsieve app.log 로 바로 실행  
> - 결과는 Markdown 표로 출력  
> - 설정 파일 없이 동작  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> logsieve는 로그 파일에서 오류 줄만 골라 원인별로 묶어 주는 CLI 도구입니다. 설정 파일이 없어도 동작하므로 Node.js 20 이상이 설치되어 있다면 `npx logsieve app.log` 명령 하나로 바로 실행할 수 있습니다. 결과는 Markdown 표로 출력됩니다.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> logsieve는 로그 파일에서 오류 줄만 골라 원인별로 묶어 주는 CLI입니다. Node.js 20 이상이 설치되어 있으면 설정 파일 없이 `npx logsieve app.log` 명령으로 바로 실행할 수 있습니다. 결과는 Markdown 표로 출력됩니다.  
<!-- /korean-style-quote -->

**달라진 점**

- 두 쪽 모두 두 번 다 메모의 다섯 가지만 담은 합니다체 단락을 썼습니다. 이 요청에서는 차이가 거의 없습니다.

## 3. 영어 README 문단 번역하기

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

**달라진 점**

- 이 도구가 없는 쪽은 두 번 모두 합니다체 문단에 `확인하세요`를 섞었고 `pre-commit 훅`이라고 썼습니다. 설치한 쪽은 두 번 모두 `확인해 주십시오`, `pre-commit hook`이라고 썼습니다.
- `the exit code is set to 1`을 이 도구가 없는 쪽은 두 번 모두 `종료 코드가 1로 설정되므로`라고 옮겼고, 설치한 쪽은 두 번 모두 `종료 코드가 1이 되므로`라고 옮겼습니다.

## 4. 장애 내용을 팀 슬랙에 공유할 요약 쓰기

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

**달라진 점**

- 이 도구가 없는 쪽은 두 번 모두 슬랙에 붙여 넣을 수 있게 썼다는 해요체 머리말로 시작해 `:rotating_light:` emoji 코드를 넣었습니다. 첫 번째 답변은 담당자와 기한을 알려 주면 넣어 주겠다는 제안으로 끝났습니다. 두 번째 답변은 담당자와 기한을 붙이라는 조언으로 끝났습니다.
- 이 도구가 없는 쪽의 첫 번째 답변에는 원문에 없는 `트래픽이 많은 시간대에 풀이 가득 차서`라는 설명도 들어갔습니다.
- 설치한 쪽은 두 번 모두 원문에 있는 시각, 원인, 영향, 후속 조치만 담았습니다.

## 5. 메모로 PR 설명 쓰기

**요청**

<!-- korean-style-quote -->
> 아래 변경 내용으로 PR 설명을 써 줘.  
>
> - 결제 클라이언트에 재시도 추가 (exponential backoff, circuit breaker)  
> - 재시도 설정을 config/retry.yaml로 분리  
> - endpoint별 timeout 설정 가능  
> - 배포 전에 DB 마이그레이션 먼저 돌려야 함  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> 말씀해 주신 변경 사항으로 PR 설명을 작성했습니다. 따로 지정된 템플릿이 없어서 많이 쓰는 형식을 사용했습니다.  
>
> ```markdown
> ## 개요
>
> 결제 클라이언트가 일시적인 장애에 더 잘 견디도록 재시도 로직(exponential backoff, circuit breaker)을 추가했습니다. 재시도 설정은 코드에서 분리했고, endpoint별로 timeout을 설정할 수 있게 했습니다.
>
> ## 변경 사항
>
> - **결제 클라이언트에 재시도 추가**
>   - exponential backoff로 실패한 요청을 재시도합니다.
>   - circuit breaker를 적용해 장애가 이어질 때 요청을 빠르게 차단합니다. 이렇게 하면 장애가 다른 서비스로 번지는 것을 막을 수 있습니다.
> - **재시도 설정을 `config/retry.yaml`로 분리**
>   - 최대 재시도 횟수, backoff 간격, circuit breaker 임계값 같은 값을 코드를 바꾸지 않고 조정할 수 있습니다.
> - **endpoint별 timeout 설정**
>   - endpoint의 특성에 맞게 timeout을 각각 다르게 설정할 수 있습니다.
>
> ## ⚠️ 배포 시 주의사항
>
> **배포 전에 DB 마이그레이션을 먼저 실행해야 합니다.**
> 마이그레이션이 적용되지 않은 상태로 배포하면 애플리케이션이 정상적으로 동작하지 않을 수 있습니다.
>
> 배포 순서:
> 1. DB 마이그레이션 실행
> 2. 마이그레이션 적용 확인
> 3. 애플리케이션 배포
>
> ## 테스트
>
> - [ ] 일시적 실패 시 backoff 간격에 따라 재시도되는지 확인
> - [ ] 연속 실패 시 circuit breaker가 open 되고, 일정 시간 후 half-open으로 회복되는지 확인
> - [ ] `config/retry.yaml` 값이 정상적으로 로드되고 반영되는지 확인
> - [ ] endpoint별 timeout 설정이 각각 적용되는지 확인
> - [ ] 스테이징 환경에서 마이그레이션 → 배포 순서로 검증
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
> ```
>
> 테스트 항목은 일반적인 확인 사항을 예시로 넣은 것입니다. 실제로 진행한 테스트에 맞게 고쳐 주세요. 마이그레이션 파일 이름이나 실행 명령어를 알려 주시면 배포 주의사항에 구체적으로 넣어 드리겠습니다.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> ## 변경 내용  
>
> - 결제 클라이언트에 재시도 로직을 추가했습니다. 재시도 간격은 exponential backoff로 늘어나며, circuit breaker도 함께 적용했습니다.  
> - 재시도 설정을 코드에서 분리해 `config/retry.yaml`로 옮겼습니다.  
> - endpoint마다 timeout을 따로 설정할 수 있습니다.  
>
> ## 배포 시 주의  
>
> 배포하기 전에 DB 마이그레이션을 먼저 실행해 주십시오.  
>
> Generated with [Claude Code](https://claude.com/claude-code)  
<!-- /korean-style-quote -->

**달라진 점**

- 이 도구가 없는 쪽은 두 번 모두 메모에 없는 테스트 체크리스트 다섯 항목과 마이그레이션이 끝났는지 확인하는 배포 단계를 넣었습니다. 첫 번째 답변은 끝에서 테스트 항목을 예시로 넣었다고 밝혔고, 두 번째 답변은 메모에 없는 `리뷰 포인트`도 넣었습니다. 두 번 모두 `⚠️`도 썼습니다.
- 설치한 쪽은 두 번 모두 메모의 네 가지만 썼습니다.
- Claude Code의 기본 지시에 따라 Claude가 PR 설명 끝에 붙이는 `Generated with [Claude Code]` 줄은 두 쪽 모두에 남았습니다.

## 6. 배포 뒤 502가 날 때 어디부터 볼지 묻기

**요청**

<!-- korean-style-quote -->
> 배포하고 나서 결제 API가 가끔 502를 내. 어디부터 보면 돼?  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> 작업 디렉터리가 비어 있어서 코드나 설정을 직접 볼 수는 없었어요. "배포 후부터, 가끔" 나는 502라는 점을 기준으로 의심되는 순서대로 정리할게요.  
>
> ## 1. 502를 누가 냈는지부터 확인  
> 502는 프록시(LB, Nginx, Ingress, API Gateway)가 **업스트림한테서 정상 응답을 못 받았다**는 뜻이에요. 그래서 앱 로그보다 프록시 로그를 먼저 봐야 해요.  
> - **Nginx:** `error.log`에 다음 중 어떤 메시지가 찍혔는지 보세요.  
>   - `upstream prematurely closed connection`: 앱이 연결을 끊음 (keep-alive나 크래시 문제)  
>   - `connect() failed (111: Connection refused)`: 앱이 아직 안 떴거나 이미 내려감 (배포나 헬스체크 문제)  
>   - `upstream timed out`: 이건 보통 504예요  
> - **AWS ALB:** 액세스 로그에서 `elb_status_code=502`인데 `target_status_code`가 `-`인 요청을 찾으세요. 타깃이 응답 없이 연결을 끊었다는 뜻이에요.  
> - 502가 난 시각을 **배포·롤링 시각, 파드 재시작 시각**과 맞춰 보세요.  
>
> ## 2. 배포 직후에만 나는 경우: 롤링 배포 문제  
> 가장 흔한 원인이에요.  
> - **Graceful shutdown이 없는 경우:** SIGTERM을 받자마자 앱이 죽으면 처리 중이던 요청이 502가 돼요.  
>   - K8s라면 `preStop`에 `sleep 5~15`를 넣고, `terminationGracePeriodSeconds`를 충분히 주세요.  
>   - 앱 쪽도 SIGTERM을 받으면 새 요청은 거절하고, 처리 중인 요청은 끝까지 마친 뒤 종료하게 해야 해요.  
> - **Readiness probe가 너무 빨리 통과하는 경우:** DB 커넥션 풀이나 워밍업이 끝나기 전에 트래픽이 들어올 수 있어요.  
> - **LB deregistration delay와 앱 종료 순서가 꼬인 경우:** LB가 타깃을 빼기 전에 앱이 먼저 죽는 상황이에요.  
>
> ## 3. 배포 후로 계속 간헐적으로 나는 경우: keep-alive 타임아웃 불일치  
> **앱의 keep-alive 타임아웃이 LB의 idle timeout보다 짧으면** 간헐적으로 502가 나요. LB는 재사용하려던 커넥션이 이미 앱 쪽에서 닫혀 있는 걸 모르고 요청을 보내기 때문이에요.  
> - **규칙:** 앱 keep-alive를 LB idle timeout보다 길게 잡으세요.  
>   - 예: ALB가 기본 60초면 앱은 65초 이상  
> - **Node.js:** `server.keepAliveTimeout = 65000`, `server.headersTimeout = 66000`  
> - **Gunicorn:** `--keep-alive` 값을 확인하세요.  
> - 런타임이나 프레임워크 버전을 올린 뒤라면 기본값이 바뀌었는지도 보세요.  
>
> ## 4. 이번 배포에서 바뀐 것 확인  
> - 결제 API는 PG사 같은 외부 호출이 길어요. 앱 타임아웃, 프록시 타임아웃, 외부 호출 타임아웃의 관계를 보세요. 앱 워커가 타임아웃으로 죽으면 502가 나요.  
>   - 예: Gunicorn `--timeout`을 넘겨서 워커가 SIGKILL 당하는 경우  
> - 앱 로그와 `dmesg`에서 OOMKilled, 워커 재시작, 크래시를 확인하세요. 메모리 limit을 바꿨다면 특히요.  
> - 워커 수, 커넥션 풀 크기, 리소스 limit이 바뀌었는지 보세요.  
> - 응답 헤더나 바디가 너무 커서 `proxy_buffer_size`를 넘기는지도 확인하세요. 이 경우 Nginx가 502를 내요.  
>
> ## ⚠️ 결제라서 꼭 같이 볼 것  
> 502가 났다고 결제가 실패한 건 아니에요. **서버에서는 결제가 처리됐는데 응답만 유실됐을 수 있어요.** 클라이언트나 게이트웨이가 자동으로 재시도한다면 이중 결제 위험이 있으니, 멱등성 키를 쓰는지 확인하고 502가 난 요청들이 PG 쪽에서 실제로 승인됐는지 대조해 보세요.  
>
> ---  
>
> 인프라 구성(K8s/ECS, ALB/Nginx), 앱 스택, 502가 나는 패턴(배포 직후에만인지 상시인지)을 알려주시거나 로그나 설정 파일을 붙여주시면 더 좁혀볼게요.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> 먼저 502를 누가 반환했는지부터 확인해 주십시오. 502는 앞단 프록시(LB, nginx, ingress)가 결제 서비스에서 정상 응답을 받지 못했을 때 반환합니다. 그래서 앱 로그보다 프록시 로그에 원인이 먼저 남습니다.  
>
> 1. **프록시 쪽 에러 로그와 응답 시간을 봐 주십시오.**  
>    - `upstream prematurely closed connection`나 `connection reset by peer`가 보이면 앱이 연결을 먼저 끊은 것입니다.  
>    - `connect() failed (111: Connection refused)`가 보이면 내려갔거나 아직 뜨지 않은 인스턴스로 요청이 간 것입니다.  
>    - 응답 시간이 거의 0ms이면 연결 문제일 가능성이 높습니다. 수십 초에서 끊기면 timeout을 의심해 주십시오.  
>
> 2. **502가 배포 중에만 나는지, 배포 뒤에도 계속 나는지 나눠 봐 주십시오.** 원인이 서로 다릅니다.  
>    - **배포 중에만 날 때:** rolling update에서 graceful shutdown이 빠진 경우가 많습니다. 확인할 항목은 SIGTERM을 받은 뒤 처리 중인 요청을 마무리하는지, readiness probe가 실제 준비 상태를 반영하는지입니다. Kubernetes라면 LB에서 pod가 빠지기 전에 요청이 들어오지 않도록 `preStop`에 sleep을 넣었는지도 확인해 주십시오.  
>    - **배포 뒤에도 가끔 날 때:** keep-alive timeout이 맞지 않는 경우가 가장 흔합니다. 앱 서버의 keep-alive timeout이 LB의 idle timeout보다 짧으면, 앱이 닫은 연결을 LB가 재사용하면서 간헐적으로 502가 납니다. 예를 들어 Node.js의 기본 `keepAliveTimeout`은 5초이고 AWS ALB의 idle timeout은 60초입니다. 앱 쪽 값을 LB보다 길게 잡아야 합니다.  
>
> 3. **배포로 바뀐 내용을 확인해 주십시오.** 이번 diff에서 다음 항목이 바뀌었는지 봐 주십시오.  
>    - 서버 설정(timeout, worker 수)  
>    - 런타임이나 프레임워크 버전(기본 keep-alive 값이 바뀌었을 수 있습니다)  
>    - 외부 PG사 호출의 timeout. 앱이 PG 응답을 기다리는 동안 프록시가 먼저 timeout을 내면 502나 504가 납니다.  
>
> 4. **인스턴스 상태를 봐 주십시오.** OOMKilled나 재시작 횟수, health check 실패 기록을 확인해 주십시오. 새 버전의 메모리 사용량이 늘어 프로세스가 죽는 경우에도 같은 증상이 나타납니다.  
>
> 인프라 구성(ALB, nginx, ingress 중 무엇인지)과 앱 런타임을 알려 주시면 확인할 설정값을 더 좁힐 수 있습니다. 이 디렉터리에 배포 설정이 있으면 경로를 알려 주십시오. 그 파일부터 보겠습니다.  
<!-- /korean-style-quote -->

**달라진 점**

- 이 도구가 없는 쪽은 두 번 모두 작업 디렉터리가 비어 있어 코드를 보지 못했다는 머리말로 시작했습니다. 첫 번째 답변은 해요체로 썼고, 두 번째 답변은 합니다체와 해요체를 섞었습니다. 두 번 모두 가운뎃점과 `⚠️`를 넣었습니다.
- 두 쪽이 짚은 원인은 거의 같습니다. 두 쪽 모두 graceful shutdown, readiness probe, keep-alive timeout, 외부 PG 호출을 들었습니다. 설치한 쪽 답변은 두 번 모두 합니다체이고 길이는 3분의 2 정도입니다.
- 두 쪽 모두 끝에서 인프라 구성을 알려 달라고 했습니다.

## 7. 영어 구조를 따라 쓴 문단 다듬기

**요청**

<!-- korean-style-quote -->
> 아래 문단을 자연스러운 한국어로 다듬어 줘. 다듬은 문단만 줘.  
>
> 이 라이브러리는 사용자가 설정 파일을 통해 캐시 정책을 정의하는 것을 허용합니다. 각 정책은 세 개의 옵션을 가지고 있으며, 만료 시간을 설정하는 것이 가능합니다. 캐시 미스가 발생하는 경우에는 원본 서버로부터 데이터를 가져오는 작업이 수행됩니다.  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> 이 라이브러리에서는 설정 파일로 캐시 정책을 정의할 수 있습니다. 정책마다 옵션이 세 가지 있으며, 만료 시간도 설정할 수 있습니다. 캐시 미스가 나면 원본 서버에서 데이터를 가져옵니다.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> 이 라이브러리를 쓰면 설정 파일에서 캐시 정책을 정의할 수 있습니다. 정책마다 옵션이 세 개 있으며, 만료 시간도 설정할 수 있습니다. 캐시 미스가 나면 원본 서버에서 데이터를 가져옵니다.  
<!-- /korean-style-quote -->

**달라진 점**

- 두 쪽 모두 두 번 다 `~를 통해`, `~하는 것을 허용합니다`, `가지고 있으며`, `~하는 것이 가능합니다`, `작업이 수행됩니다`를 모두 고쳤습니다. 이 요청에서는 차이가 없습니다.

## 8. PR 리뷰 코멘트 쓰기

**요청**

<!-- korean-style-quote -->
> 동료가 올린 PR에 남길 리뷰 코멘트를 써 줘. 내가 찾은 문제는 두 가지야.  
>
> - 외부 API 재시도 루프에 최대 횟수가 없어서 API가 계속 실패하면 요청이 끝나지 않음  
> - catch 블록에서 에러를 로그도 남기지 않고 무시함  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> PR에 바로 붙여 넣을 수 있게 두 코멘트로 나눠 썼습니다. 코드를 보지 않고 쓴 거라 예시 코드는 일반적인 JS/TS 형태로 넣었습니다. 실제 언어와 코드에 맞게 바꿔 주세요.  
>
> ---  
>
> **코멘트 1: 재시도 루프에 최대 횟수 제한 필요**  
>
> > 외부 API 재시도 루프에 최대 재시도 횟수가 없어서, API가 장애 등으로 계속 실패하면 이 요청이 끝나지 않을 것 같습니다. 그러면 요청을 처리하던 워커나 커넥션이 계속 잡혀 있고, 장애가 길어지면 다른 요청까지 영향을 받을 수 있을 것 같아요.  
> >  
> > 아래처럼 최대 횟수를 두고, 다 실패하면 에러를 위로 던지면 좋겠습니다. 재시도 간격에 지수 백오프(+ jitter)를 넣으면 장애 중인 API에 부하를 덜 줄 수 있어요.  
> >  
> > ```ts  
> > const MAX_RETRIES = 3;  
> >  
> > for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {  
> >   try {  
> >     return await callExternalApi();  
> >   } catch (err) {  
> >     if (attempt === MAX_RETRIES) throw err;  
> >     await sleep(2 ** attempt * 100 + Math.random() * 100);  
> >   }  
> > }  
> > ```  
> >  
> > 그리고 4xx처럼 다시 시도해도 결과가 같은 에러는 재시도하지 않고 바로 실패 처리하는 것도 고려해 주시면 좋겠습니다.  
>
> ---  
>
> **코멘트 2: catch 블록에서 에러가 무시됨**  
>
> > 이 catch 블록은 에러를 받기만 하고 로그도 남기지 않아서, 여기서 문제가 생겨도 운영 중에 알아채거나 원인을 찾기가 어려울 것 같습니다.  
> >  
> > 최소한 에러 로그는 남겨 주시면 좋겠어요. 여기서 복구할 수 없는 에러라면 호출한 쪽에서 처리할 수 있게 다시 던지는 게 더 안전할 것 같습니다.  
> >  
> > ```ts  
> > } catch (err) {  
> >   logger.error('외부 API 호출 실패', { err, /* 요청 ID 등 컨텍스트 */ });  
> >   throw err;  
> > }  
> > ```  
> >  
> > 일부러 무시하는 경우라면 왜 무시해도 되는지 주석을 남겨 주세요.  
>
> ---  
>
> PR의 실제 코드(diff나 파일 경로)를 알려 주시면 그 언어와 구조에 맞춰 줄 단위 코멘트로 다시 써 드릴게요.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> **1. 재시도 횟수에 상한이 없습니다**  
>
> 외부 API 재시도 루프에 최대 횟수가 정해져 있지 않습니다. API가 계속 실패하면 루프가 끝나지 않아 요청이 응답 없이 계속 붙잡혀 있게 됩니다. 최대 재시도 횟수를 정하고, 그 횟수를 넘기면 에러를 호출한 쪽으로 넘겨 주십시오. 재시도 사이에 backoff를 두면 장애가 난 API에 요청이 몰리는 것도 막을 수 있습니다.  
>
> **2. catch 블록에서 에러를 그냥 버립니다**  
>
> catch 블록이 에러를 받은 뒤 로그도 남기지 않고 무시합니다. 이대로면 실패가 나도 흔적이 없어서 원인을 추적하기 어렵습니다. 적어도 에러 내용은 로그로 남겨 주십시오. 여기서 복구할 수 없는 에러라면 다시 throw해서 위에서 처리하게 해 주십시오.  
<!-- /korean-style-quote -->

**달라진 점**

- 이 도구가 없는 쪽은 두 번 모두 코드를 보지 못했다는 머리말로 시작해, 보지 못한 코드를 가정한 예시 코드를 넣었습니다. 끝에는 실제 코드를 주면 다시 써 주겠다는 제안을 붙였습니다.
- 이 도구가 없는 쪽은 `~것 같습니다`나 `~것 같아요`처럼 확신을 줄이는 말을 첫 번째 답변에서 네 번 썼습니다. 두 번째 답변에서는 세 번 썼고, 두 답변 모두 해요체를 섞었습니다.
- 설치한 쪽은 두 번 모두 합니다체로 두 문제를 짚고 그 영향과 고칠 방향만 썼습니다. 길이는 3분의 1 정도입니다.

## 9. 커밋 메시지 쓰기

**요청**

<!-- korean-style-quote -->
> 아래 변경 내용으로 커밋 메시지를 써 줘.  
>
> - 로그인 API에 rate limit 추가 (IP당 분당 10회)  
> - 한도를 넘으면 429 반환  
> - rate limit 테스트 추가  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> ```
> 로그인 API에 IP 기반 rate limit 추가
>
> - 로그인 요청을 IP당 분당 10회로 제한
> - 한도를 넘은 요청에는 429 Too Many Requests 반환
> - rate limit 동작을 확인하는 테스트 추가
>
> Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
> ```
>
> Conventional Commits 형식을 쓰는 프로젝트라면 제목을 `feat(auth): 로그인 API에 IP 기반 rate limit 추가`로 바꾸면 돼요.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> ```
> feat: 로그인 API에 IP별 rate limit 추가
>
> - 같은 IP에서는 로그인 API를 1분에 10번까지만 호출할 수 있게 했습니다.
> - 한도를 넘은 요청에는 429 Too Many Requests를 반환합니다.
> - rate limit이 제대로 동작하는지 확인하는 테스트를 추가했습니다.
>
> Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
> ```
<!-- /korean-style-quote -->

**달라진 점**

- 이 도구가 없는 쪽은 두 번 모두 항목을 `~로 제한`, `~반환`, `~추가`처럼 명사로 끝냈습니다. 끝에는 다른 형식을 쓰려면 이렇게 하라는 해요체 조언을 붙였고, 두 번째 답변에는 영어 커밋 메시지도 하나 더 붙였습니다.
- 설치한 쪽은 두 번 모두 `feat:` 제목 뒤에 항목마다 완결된 문장을 썼습니다.
- 이 도구가 없는 쪽은 두 번 모두 `Co-Authored-By` 줄을 넣었습니다. 설치한 쪽은 첫 번째 답변에만 이 줄을 넣었습니다.

## 10. 함수에 한국어 주석 달기

**요청**

<!-- korean-style-quote -->
> 아래 함수에 한국어 주석을 달아 줘. 코드는 바꾸지 마.  
>
> ```js
> function backoffDelay(attempt, base = 200, max = 10000) {
>   const delay = Math.min(max, base * 2 ** attempt);
>   return delay / 2 + Math.random() * (delay / 2);
> }
> ```
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> ```js
> /**
>  * 재시도 횟수에 따라 대기 시간(ms)을 계산한다.
>  * 지수 백오프에 "equal jitter" 방식을 적용한다.
>  *
>  * @param {number} attempt - 재시도 횟수 (0부터 시작)
>  * @param {number} [base=200] - 기준 대기 시간(ms)
>  * @param {number} [max=10000] - 대기 시간 상한(ms)
>  * @returns {number} 실제로 기다릴 시간(ms). 범위는 [delay/2, delay)
>  */
> function backoffDelay(attempt, base = 200, max = 10000) {
>   // 재시도할 때마다 대기 시간을 두 배로 늘리되(base * 2^attempt), max를 넘지 않게 자른다.
>   const delay = Math.min(max, base * 2 ** attempt);
>   // 절반은 고정으로 두고 나머지 절반만 무작위로 정한다.
>   // 여러 클라이언트가 같은 시점에 몰려서 재시도하는 일(thundering herd)을 막으면서도
>   // 최소 대기 시간(delay/2)은 보장한다.
>   return delay / 2 + Math.random() * (delay / 2);
> }
> ```
>
> 참고로 `attempt`가 커서 `2 ** attempt`가 `Infinity`가 되더라도 `Math.min`이 `max`를 돌려주므로 결과는 정상입니다.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> ```js
> /**
>  * 재시도할 때 기다릴 시간(ms)을 계산합니다.
>  * 지수 백오프로 대기 시간을 늘리고, 그 절반 범위에 무작위 값(jitter)을 더합니다.
>  *
>  * @param {number} attempt 재시도 횟수입니다. 0이면 base를 기준으로 계산합니다.
>  * @param {number} base 기준 대기 시간(ms)입니다.
>  * @param {number} max 대기 시간의 상한(ms)입니다.
>  * @returns {number} delay / 2 이상 delay 미만의 대기 시간(ms)입니다.
>  */
> function backoffDelay(attempt, base = 200, max = 10000) {
>   // 재시도할 때마다 대기 시간을 두 배로 늘리되 max를 넘지 않게 합니다.
>   const delay = Math.min(max, base * 2 ** attempt);
>   // 절반은 고정하고 나머지 절반은 무작위로 정합니다.
>   // 여러 클라이언트가 같은 시각에 한꺼번에 재시도하지 않도록 시점을 흩어 놓습니다.
>   return delay / 2 + Math.random() * (delay / 2);
> }
> ```
<!-- /korean-style-quote -->

**달라진 점**

- 이 도구가 없는 쪽은 두 번 모두 주석을 `계산한다`처럼 한다체로 썼습니다. 첫 번째 답변은 코드 밖에 묻지 않은 참고 설명을 붙였고, 두 번째 답변은 `코드는 바꾸지 않고 주석만 추가했어요.`라는 해요체 문장으로 끝났습니다.
- 설치한 쪽은 두 번 모두 이 프로젝트의 어투인 합니다체로 주석만 달았습니다.
- 두 쪽 모두 대기 시간이 두 배씩 늘다가 max에서 멈추고, 함수가 그 절반에서 전체 사이의 무작위 값을 돌려준다는 동작을 맞게 설명했습니다.

## 11. 쿠버네티스 Pod가 Pending인 이유 묻기

**요청**

<!-- korean-style-quote -->
> 쿠버네티스에 새로 배포한 Pod가 계속 Pending이고, 이벤트에 0/3 nodes are available: 3 Insufficient cpu라고 나와. 노드 CPU 사용률은 30%밖에 안 되는데 왜 이래?  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> 스케줄러는 **실제 사용률이 아니라 requests 합계**를 기준으로 Pod를 배치하기 때문입니다. 실제 CPU 사용률이 30%여도 노드에 이미 올라간 Pod들의 `resources.requests.cpu` 합이 노드의 allocatable에 가까우면, 새 Pod의 request가 들어갈 자리가 없어서 `Insufficient cpu`가 뜹니다. 보통 request를 넉넉하게 잡아 두고 실제로는 덜 쓰는 Pod가 많을 때 이렇게 됩니다.  
>
> ## 확인 방법  
>
> **1. 노드별 request 할당 현황 보기**  
> ```bash
> kubectl describe node <노드명> | grep -A 8 "Allocated resources"
> ```
> ```
> Resource  Requests      Limits
> cpu       3850m (96%)   6 (150%)   ← 이 값이 기준
> ```
> 여기 Requests 비율이 높으면 원인이 확인된 겁니다. `kubectl top node`로 보는 30%는 실제 사용량이라 스케줄링과는 상관없습니다.  
>
> **2. 새 Pod가 요청하는 CPU 확인**  
> ```bash
> kubectl get pod <pod명> -o jsonpath='{.spec.containers[*].resources}'
> ```
> initContainer도 같이 보세요. 스케줄러는 `max(initContainer 중 최대값, 일반 컨테이너 합)`으로 계산합니다.  
>
> **3. request를 많이 잡은 Pod 찾기**  
> ```bash
> kubectl get pods -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,CPU_REQ:.spec.containers[*].resources.requests.cpu,NODE:.spec.nodeName
> ```
>
> **4. 다른 원인도 같이 확인**  
> - **LimitRange**: 네임스페이스에 기본 request가 설정돼 있어서, Pod에 request를 적지 않았는데도 큰 값이 들어갔을 수 있습니다. `kubectl get limitrange -n <ns>`로 확인하세요.  
> - **allocatable < capacity**: kube-reserved, system-reserved, DaemonSet(로깅, CNI, 모니터링 등)이 생각보다 많이 차지하고 있을 수 있습니다.  
> - **request 단위 실수**: `cpu: 2`(2코어)를 `200m`으로 쓰려던 것처럼 단위를 잘못 적었는지도 확인해 보세요.  
>
> ## 해결 방법  
>
> | 방법 | 설명 |  
> |---|---|  
> | **과도한 request 줄이기** (권장) | `kubectl top pod`나 Prometheus로 실제 사용량을 보고 기존 Pod들의 request를 현실적인 값으로 낮춥니다. VPA를 recommendation 모드로 돌리면 추천값을 받을 수 있습니다. |  
> | 새 Pod의 request 낮추기 | 꼭 필요한 만큼만 요청합니다. |  
> | 노드 추가 / Cluster Autoscaler | 실제로 용량이 부족할 때 쓰는 방법입니다. |  
> | 불필요한 Pod 정리 | 안 쓰는 Deployment나 replica 수가 과한 워크로드를 정리합니다. |  
>
> 참고로 CPU limit은 스케줄링에 영향을 주지 않습니다. request만 봅니다. 그래서 "request는 낮게, 실제 사용량에 맞게" 잡는 게 클러스터 효율에 가장 중요합니다.  
>
> `kubectl describe node` 결과를 붙여 주시면 어디서 request가 많이 잡혀 있는지 같이 봐 드릴게요.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> 스케줄러는 실제 CPU 사용률을 보지 않습니다. 노드의 allocatable CPU에서 이미 배치된 Pod들의 `resources.requests.cpu` 합계를 뺀 값이 새 Pod의 request보다 작으면, 실제 사용률이 30%여도 `Insufficient cpu`로 Pending이 됩니다. 기존 Pod들이 request를 넉넉하게 잡아 두고 실제로는 덜 쓰는 경우에 이렇게 됩니다.  
>
> 아래 순서로 확인해 주십시오.  
>
> 1. 노드별로 할당된 request 합계를 확인합니다. `Allocated resources`의 CPU Requests가 100%에 가까우면 이 경우에 해당합니다.  
>    ```bash
>    kubectl describe node <node-name> | grep -A 8 "Allocated resources"
>    ```
> 2. 새 Pod가 요청하는 CPU 양을 확인합니다. request를 따로 적지 않았더라도 namespace의 LimitRange가 기본 request를 넣을 수 있으므로, 실제로 적용된 값을 봐야 합니다.  
>    ```bash
>    kubectl get pod <pod-name> -o jsonpath='{.spec.containers[*].resources}'
>    kubectl get limitrange -n <namespace> -o yaml
>    ```
> 3. 어떤 Pod가 request를 많이 잡고 있는지, 그리고 실제로는 얼마나 쓰는지 비교합니다. `kubectl top`을 쓰려면 metrics-server가 있어야 합니다.  
>    ```bash
>    kubectl get pods -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,CPU_REQ:.spec.containers[*].resources.requests.cpu
>    kubectl top pods -A --sort-by=cpu
>    ```
>
> 원인이 확인되면 아래 방법 중 상황에 맞는 것을 고르면 됩니다.  
>
> - 새 Pod의 CPU request를 실제로 필요한 만큼 낮춥니다.  
> - 기존 Pod 가운데 실제 사용량보다 request가 크게 잡힌 것을 줄입니다. 가장 효과가 큰 방법인 경우가 많습니다.  
> - 노드를 추가하거나, Cluster Autoscaler를 쓰고 있다면 node group의 최대 노드 수를 늘립니다.  
> - DaemonSet이나 시스템 Pod의 request가 큰지도 확인합니다. 이런 Pod는 모든 노드에서 allocatable을 차지합니다.  
>
> request를 limit만큼 높게 잡아 둔 Deployment가 원인인 경우가 흔합니다. 다만 노드마다 사정이 다를 수 있으므로 1번 결과부터 먼저 확인해 주십시오.  
<!-- /korean-style-quote -->

**달라진 점**

- 두 쪽 모두 두 번 다 스케줄러가 실제 사용률이 아니라 requests 합계로 배치를 정한다는 원인을 맞게 설명했습니다.
- 이 도구가 없는 쪽은 두 번 모두 합니다체 사이에 `확인해 보세요` 같은 해요체를 섞었고, 표를 넣었으며, 결과를 붙여 주면 같이 봐 주겠다는 제안으로 답변을 끝냈습니다. 설치한 쪽은 두 번 모두 합니다체로 썼고 표와 제안이 없습니다.

## 12. 이용자에게 보낼 점검 공지 쓰기

**요청**

<!-- korean-style-quote -->
> 서비스 이용자에게 보낼 점검 공지를 써 줘. 10월 24일 새벽 2시부터 4시까지 결제 기능만 멈추고, 조회와 다른 기능은 그대로 쓸 수 있어.  
<!-- /korean-style-quote -->

**이 도구가 없는 프로젝트**

<!-- korean-style-quote -->
> # [공지] 결제 시스템 정기 점검 안내  
>
> 안녕하세요, [서비스명]입니다.  
>
> 더 안정적인 서비스를 위해 결제 시스템 점검을 진행합니다. 점검 시간에는 **결제 기능만 이용할 수 없고**, 그 밖의 기능은 평소처럼 이용하실 수 있습니다.  
>
> ### 점검 일시  
> **2026년 10월 24일(토) 오전 2시 ~ 오전 4시 (2시간)**  
>
> ※ 작업 상황에 따라 끝나는 시간이 앞당겨지거나 늦어질 수 있습니다.  
>
> ### 점검 중 이용 안내  
> | 구분 | 이용 여부 |  
> |---|---|  
> | 결제 (구매, 충전, 정기결제 등) | ❌ 이용 불가 |  
> | 조회 (주문·결제 내역 등) | ✅ 정상 이용 |  
> | 그 밖의 모든 기능 | ✅ 정상 이용 |  
>
> ### 참고해 주세요  
> - 점검 직전에 결제를 진행하시면 중간에 끊길 수 있으니, **오전 2시 전에 결제를 마쳐 주세요.**  
> - 점검 시간과 겹치는 정기결제는 점검이 끝난 뒤 순서대로 처리됩니다.  
> - 점검이 끝나면 결제 기능을 바로 다시 이용하실 수 있습니다.  
>
> 이용에 불편을 드려 죄송합니다. 더 나은 서비스로 보답하겠습니다.  
>
> 문의: [고객센터 연락처 / 이메일]  
>
> 감사합니다.  
> [서비스명] 드림  
>
> ---  
>
> **보내기 전에 확인할 점**  
> - 요일은 2026년 10월 24일 기준인 토요일로 적었습니다. 연도가 다르면 요일도 바꿔야 합니다.  
> - 정기결제를 점검 후에 처리한다는 문구는 제가 넣은 것입니다. 실제 처리 방식과 다르면 고치거나 지워 주세요.  
> - 대괄호 `[ ]` 부분은 실제 정보로 바꿔 주세요.  
>
> 푸시 알림이나 문자처럼 짧은 버전이 필요하면 말씀해 주세요.  
<!-- /korean-style-quote -->

**이 도구를 설치한 프로젝트**

<!-- korean-style-quote -->
> **[안내] 10월 24일(토) 결제 서비스 점검**  
>
> 안녕하십니까.  
>
> 더 안정적인 서비스를 위해 아래 일정으로 결제 시스템을 점검합니다.  
>
> - 일시: 2026년 10월 24일(토) 새벽 2시부터 4시까지 (2시간)  
> - 영향: 점검 시간에는 결제를 할 수 없습니다.  
> - 정상 이용: 조회를 비롯한 다른 기능은 점검 중에도 평소처럼 이용하실 수 있습니다.  
>
> 결제가 필요하시면 점검 시작 전이나 점검이 끝난 뒤에 진행해 주십시오. 작업 상황에 따라 점검이 일찍 끝날 수 있습니다.  
>
> 이용에 불편을 드려 죄송합니다. 더 나은 서비스로 보답하겠습니다.  
>
> 감사합니다.  
<!-- /korean-style-quote -->

**달라진 점**

- 이 도구가 없는 쪽의 첫 번째 답변은 `❌`, `✅`를 넣은 표를 만들고 가운뎃점을 썼습니다. 두 답변에는 모두 `[서비스명]` 같은 빈칸과 보내기 전에 고칠 점이 붙어 있었고, 끝은 짧은 버전이 필요하면 말해 달라는 제안이었습니다.
- 이 도구가 없는 쪽의 첫 번째 답변은 정기결제를 점검 뒤에 처리한다는 내용을 넣었습니다. 요청에 없던 내용이며, Claude도 답변 끝에서 이 문구는 직접 넣었다고 밝혔습니다.
- 설치한 쪽은 두 번 모두 공지 본문만 썼습니다. 다만 첫 번째 답변에는 `작업 상황에 따라 점검이 일찍 끝날 수 있습니다`처럼 요청에 없는 문장이 들어갔습니다. 이 도구가 없는 쪽은 두 번 모두 비슷한 문장을 넣었고, `더 안정적인 서비스를 위해` 같은 상투적인 문구는 두 쪽 모두에 있습니다.
