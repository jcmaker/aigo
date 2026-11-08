# DashPi 클립 AIGO 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DashPi 사고 클립을 AIGO 서버에 자동 업로드해 worker가 분석하고, 같은 계정의 AIGO 웹·앱에 DashPi 배지로 보이게 한다. 기존 기능은 그대로 둔다.

**Architecture:** AIGO API는 분석 생성·제출 두 라우트만 Clerk API Key를 추가로 받고, 인증 방식으로 `analyses.source`(`upload`/`dashpi`)를 정한다. 웹·앱은 `source`로 배지를 그린다. DashPi는 클립 저장 직후 사고 폴더에 `aigo.json`(pending)을 쓰고, 별도 스레드 업로더가 기존 3단계 API(생성 → presigned PUT → 제출)로 올린다.

**Tech Stack:** AIGO: FastAPI, SQLAlchemy 2, Alembic, clerk-backend-api 7.1.0, Next.js 16, Expo. DashPi: Python 표준 라이브러리(`urllib`), PySide6.

**Spec:** `docs/superpowers/specs/2026-11-08-dashpi-upload-design.md`

## Global Constraints

- 기존 동작 불변: 세션 토큰 인증, 기존 업로드, Pi 로컬 분석·재시도·QR·Local Wi-Fi.
- API Key는 `POST /api/v1/analyses`, `POST /api/v1/analyses/{id}/submit`에서만 받는다. 그 외 라우트는 API Key에 401.
- API Key는 `subject`가 `user_`로 시작하고 `revoked`·`expired`가 거짓일 때만 인정. Clerk 검증 서비스 장애는 503 `AUTH_PROVIDER_UNAVAILABLE`.
- `source`는 클라이언트가 보내지 않는다. API Key → `dashpi`, 세션 토큰 → `upload`.
- 하루 한도(사용자 5, 전체 100), 200MB 제한은 그대로.
- DashPi: 새 Python 의존성 금지. 설정 파일 `~/.config/dashpi/aigo.env`, 키 `DASHPI_AIGO_API_URL`, `DASHPI_AIGO_API_KEY`. 환경변수 `DASHPI_AIGO_*`가 파일 값을 덮어쓴다.
- DashPi: 키가 없으면 `aigo.json`을 만들지 않고 기존과 완전히 같다. 외부 영상·재분석 경로는 업로드하지 않는다.
- 재시도 간격: 네트워크·408·5xx·503 → `ai_client.retry_delay(attempts)`(1·2·5·10·30분). 429 → 다음 날 00:05 현지 시각. 401·403 → `failed`("AIGO 키 확인 필요"), 앱 시작 시 한 번 `pending`으로 복구. 그 밖의 4xx → `failed`(서버 메시지).
- 웹·앱 배지 문구: `DashPi`. 색 값 직접 금지(웹 `Badge`, 앱 `theme.ts`/ui 부품).

## Review Focus

- 업로드 도중 Pi 분석이 같은 사고의 `metadata.json`을 저장해도 `aigo.json`과 서로 덮어쓰지 않아야 한다 → Task 6 테스트 `test_upload_does_not_touch_metadata`.
- 클립 파일이 지문과 다르거나 사라진 사고는 올리지 않고 `failed`로 둬야 한다 → Task 6 `test_digest_mismatch_fails_without_request`.
- presigned PUT은 성공했는데 제출이 5xx로 실패하면 다음 시도에서 새로 만들되 `uploaded` 전까지 중복 표시가 없어야 한다 → Task 6 `test_submit_failure_stays_pending`.
- 세션 토큰 사용자의 기존 업로드가 `source=upload`로 계속 보여야 한다 → Task 1 `test_session_upload_source_is_upload`.
- 업로드 스레드 예외가 Qt 타이머나 녹화를 멈추지 않아야 한다 → Task 7 `test_upload_tick_exception_is_logged`.

---

## AIGO 저장소 (`~/workspace/university/aigo`, 브랜치 `feat/dashpi-upload`)

### Task 1: `analyses.source` 열과 응답 필드

**Files:**
- Create: `apps/api/alembic/versions/0006_analysis_source.py`
- Modify: `apps/api/app/models.py` (`Analysis`), `apps/api/app/routes/analyses.py` (`AnalysisOut`, `_out`)
- Test: `apps/api/tests/test_analyses_api.py`

**Interfaces:**
- Produces: `Analysis.source: Mapped[str]` (`String(10)`, 기본 `"upload"`, NOT NULL, server_default `'upload'`), `AnalysisOut.source: str`

- [ ] **Step 1: 실패하는 테스트**

```python
def test_session_upload_source_is_upload(client, db, user, storage, auth_header):
    r = client.post("/api/v1/analyses", json={"filename": "a.mp4", "size": 10, "consent": True}, headers=auth_header)
    aid = r.json()["id"]
    assert client.get(f"/api/v1/analyses/{aid}", headers=auth_header).json()["source"] == "upload"
```
(파일의 기존 인증 헤더·fixture 이름을 따른다.)

- [ ] **Step 2:** `cd apps/api && uv run pytest tests/test_analyses_api.py -k source -v` → FAIL(KeyError `source`)
- [ ] **Step 3:** 마이그레이션 0006(revises 0005, `add_column` + downgrade `drop_column`), 모델 열, `AnalysisOut.source`, `_out`에 `"source": a.source` 추가
- [ ] **Step 4:** `uv run pytest -m 'not model'` → 전부 PASS
- [ ] **Step 5:** Commit `feat(api): 분석 출처 source 열`

### Task 2: 업로드 라우트용 API Key 인증

**Files:**
- Modify: `apps/api/app/auth.py`, `apps/api/app/routes/analyses.py` (`create_analysis`, `submit_analysis`)
- Modify: `apps/api/tests/conftest.py` (`FakeClerk`에 `api_keys.verify_api_key` 추가)
- Test: `apps/api/tests/test_auth.py`
- Create: `apps/api/scripts/create_dashpi_key.py`
- Modify: `README.md` (환경변수 표 아래 "DashPi 업로드 키" 절)

**Interfaces:**
- Consumes: Task 1 `Analysis.source`
- Produces: `class Uploader(NamedTuple): user: User; source: str` 와 FastAPI 의존성 `current_uploader(request, db, clerk) -> Uploader` (in `app/auth.py`). `create_analysis`·`submit_analysis`는 `current_user` 대신 이것을 쓰고, 생성 시 `Analysis(source=uploader.source, ...)`.

규칙:
- 헤더가 `Bearer ak_`로 시작하면 `clerk.api_keys.verify_api_key(secret=<token>)`. 응답 `subject`가 `user_`로 시작, `revoked`/`expired` 거짓 → 그 Clerk ID로 기존 `current_user`와 같은 사용자 조회·생성 로직(공통 부분은 함수로 뽑아 재사용) → `Uploader(user, "dashpi")`.
- 검증 예외 중 HTTP 4xx 응답 → 401 `UNAUTHORIZED`, 그 밖(5xx·네트워크) → 503 `AUTH_PROVIDER_UNAVAILABLE`.
- 그 외 헤더 → 기존 `current_user` 그대로 → `Uploader(user, "upload")`.
- `current_user`는 바꾸지 않는다(세션 토큰 전용) → 다른 라우트는 API Key에 자동으로 401.

- [ ] **Step 1: 실패하는 테스트** (`FakeClerk.api_keys.verify_api_key`가 `fake_clerk.api_keys_result`(SimpleNamespace) 반환 또는 `fake_clerk.api_keys_error` 예외 발생)

```python
AK = {"Authorization": "Bearer ak_test_123"}

def test_api_key_creates_dashpi_analysis(client, db, fake_clerk, storage):
    fake_clerk.api_keys_result = SimpleNamespace(subject="user_pi", revoked=False, expired=False)
    r = client.post("/api/v1/analyses", json={"filename": "clip.mp4", "size": 10, "consent": True}, headers=AK)
    assert r.status_code == 201
    a = db.get(Analysis, r.json()["id"])
    assert a.source == "dashpi" and a.user.clerk_user_id == "user_pi"   # 관계가 없으면 User 조회로 확인

@pytest.mark.parametrize("res", [
    SimpleNamespace(subject="org_1", revoked=False, expired=False),
    SimpleNamespace(subject="user_pi", revoked=True, expired=False),
    SimpleNamespace(subject="user_pi", revoked=False, expired=True)])
def test_api_key_rejected(client, fake_clerk, res): ...  # 401

def test_api_key_verify_4xx_is_401(client, fake_clerk): ...      # api_keys_error = 404 응답 예외 → 401
def test_api_key_provider_down_is_503(client, fake_clerk): ...   # api_keys_error = RuntimeError → 503

@pytest.mark.parametrize("method,path", [("get", "/api/v1/me"), ("delete", "/api/v1/analyses/1"),
    ("get", "/api/v1/analyses"), ("post", "/api/v1/devices"), ("post", "/api/v1/orders")])
def test_api_key_only_on_upload_routes(client, fake_clerk, method, path): ...  # 401
```

- [ ] **Step 2:** `uv run pytest tests/test_auth.py -k api_key -v` → FAIL
- [ ] **Step 3:** `current_uploader` 구현, 두 라우트 교체, `FakeClerk` 확장
- [ ] **Step 4:** `uv run pytest -m 'not model'` → 전부 PASS (기존 세션 토큰 테스트 포함)
- [ ] **Step 5:** `scripts/create_dashpi_key.py <email>`: DB에서 이메일로 사용자 `clerk_user_id`를 찾아 `Clerk(...).api_keys.create_api_key(name="DashPi", subject=<id>)` 후 secret 한 번만 출력. README에 대시보드 위치(Configure → Developers → API keys, 사용자·조직 생성 옵션은 끔), 스크립트 사용법, "키를 Pi에 넣는 것이 업로드 동의" 한 줄
- [ ] **Step 6:** Commit `feat(api): DashPi API Key로 분석 업로드`

### Task 3: 웹 DashPi 배지

**Files:**
- Modify: `apps/web/openapi.json`, `apps/web/lib/api.gen.ts` (재생성), `apps/web/components/analysis/AnalysisList.tsx`, `apps/web/components/analysis/ReportView.tsx`(헤더 Badge 옆), `apps/web/components/analysis/ProgressView.tsx`(진행 중 상세)
- Modify: `apps/web/components/analysis/fixtures.ts` (`source` 필드)
- Test: `apps/web/components/analysis/analysis.test.tsx`

**Interfaces:**
- Consumes: Task 1 `AnalysisOut.source`
- Create: `apps/web/components/analysis/SourceBadge.tsx`
- Produces: `SourceBadge({ source }: { source: string })` — `source === "dashpi"`이면 `<Badge tone="neutral">DashPi</Badge>`, 아니면 null

- [ ] **Step 1:** README의 명령으로 OpenAPI 덤프 후 `pnpm gen:api`
- [ ] **Step 2: 실패하는 테스트** — 목록에 `source: "dashpi"` 항목은 `DashPi` 텍스트, `upload` 항목은 없음. 완료 상세(ReportView)도 같은 단언
- [ ] **Step 3:** `pnpm vitest run analysis` → FAIL
- [ ] **Step 4:** `SourceBadge` 추가, 목록 행의 상태 배지 앞, 상세 헤더 Badge 옆, 진행 화면 제목 옆에 배치
- [ ] **Step 5:** `pnpm vitest run && pnpm build` → PASS
- [ ] **Step 6:** Commit `feat(web): DashPi 분석 배지`

### Task 4: 앱 DashPi 배지

**Files:**
- Modify: `apps/app/src/lib/api.gen.ts` (재생성: `npx openapi-typescript ../web/openapi.json -o src/lib/api.gen.ts`), `apps/app/src/components/ui/Chips.tsx`, `apps/app/src/components/AnalysisRow.tsx`, `apps/app/src/app/analyses/[id].tsx`
- Test: `apps/app/src/components/ui/ui.test.tsx` 또는 기존 행 테스트 파일

**Interfaces:**
- Consumes: Task 1 `AnalysisOut.source`
- Produces: `SourceChip({ source }: { source: string })` in `Chips.tsx` — `dashpi`일 때만 `StatusChip`과 같은 모양의 중립 톤 칩 `DashPi`

- [ ] **Step 1: 실패하는 테스트** — `AnalysisRow`에 `source: "dashpi"` → `DashPi` 텍스트 존재, `upload` → 없음
- [ ] **Step 2:** `pnpm test` → FAIL
- [ ] **Step 3:** 재생성, `SourceChip` 구현, 행의 `StatusChip` 앞과 상세 `TopBar` subtitle 아래(또는 상단 칩 줄)에 배치
- [ ] **Step 4:** `pnpm exec tsc --noEmit && pnpm test` → PASS
- [ ] **Step 5:** Commit `feat(app): DashPi 분석 배지`

---

## DashPi 저장소 (`~/Documents/ChatGPT/DashPi`, `dev`에서 브랜치 `feat/aigo-upload`)

### Task 5: AIGO 설정과 HTTP 클라이언트

**Files:**
- Create: `src/dashpi/aigo_upload.py`, `aigo.env.example`
- Test: `tests/test_aigo_upload.py`

**Interfaces:**
- Consumes: `ai_client._read_env_file`, `ai_client._valid_base_url`(AnalysisError를 던짐 → 설정 무효로 보고 `None`), `ai_client._NoRedirect`
- Produces:
  - `DEFAULT_AIGO_CONFIG = Path.home()/".config"/"dashpi"/"aigo.env"`
  - `@dataclass(frozen=True) class AigoConfig: api_url: str; api_key: str`
  - `load_aigo_config(path=DEFAULT_AIGO_CONFIG, environ=os.environ) -> AigoConfig | None` (키 없거나 URL 무효 → None, 로그 경고)
  - `class UploadDeferred(Exception): retry_at: datetime | None` (None이면 호출 측이 `retry_delay` 사용)
  - `class UploadRejected(Exception): auth: bool`
  - `class AigoClient: __init__(config, opener=None, timeout=60.0); upload(clip: Path) -> int` — 생성(`{"filename": "clip.mp4", "size", "consent": True}`) → 받은 `upload_url`에 `upload_headers`로 PUT(파일 스트리밍) → 제출. 분석 id 반환.
  - 상태 매핑: URLError/OSError/408/5xx → `UploadDeferred(None)`; 429 → `UploadDeferred(next_day_0005(now))`; 401/403 → `UploadRejected("AIGO 키 확인 필요", auth=True)`; 기타 4xx → `UploadRejected(<응답 message 또는 HTTP 코드>, auth=False)`. PUT 단계의 403(만료 URL)은 `UploadDeferred(None)`.

- [ ] **Step 1: 실패하는 테스트** — 가짜 opener(요청 기록, 순서대로 응답·예외 반환)로:
  - `test_config_missing_key_returns_none`, `test_env_overrides_file`, `test_http_url_rejected_unless_loopback`
  - `test_upload_runs_create_put_submit` (요청 3개 순서, Authorization `Bearer ak_…`는 생성·제출에만 있고 PUT에는 없음, 반환 id)
  - `test_429_defers_to_next_day_0005`, `test_5xx_and_network_defer`, `test_401_rejects_auth`, `test_400_rejects_with_message`, `test_put_403_defers`
- [ ] **Step 2:** `.venv/bin/python -m pytest tests/test_aigo_upload.py -v` → FAIL
- [ ] **Step 3:** 구현. `aigo.env.example`은 `ai.env.example` 형식, URL 기본값 `https://api-production-68ccb.up.railway.app`, chmod 600 안내
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit `feat: AIGO upload client and config`

### Task 6: 업로드 대기열 (`aigo.json`)

**Files:**
- Modify: `src/dashpi/aigo_upload.py`
- Test: `tests/test_aigo_upload.py`

**Interfaces:**
- Consumes: Task 5 전부, `storage.atomic_write`, `storage.sha256_file`, `IncidentStore.directory/load/list`, `ai_client.retry_delay`
- Produces:
  - `AIGO_STATE = "aigo.json"`; 필드 `state`("pending"|"uploaded"|"failed"), `attempts`, `next_attempt_at`(ISO|None), `reason`, `analysis_id`, `uploaded_at`
  - `mark_pending(store: IncidentStore, incident_id: str) -> None` — 파일이 없을 때만 `{"state": "pending", "attempts": 0}` 작성
  - `class AigoUploader: __init__(store, client: AigoClient, now=lambda: datetime.now(UTC)); recover() -> None; tick() -> str | None; close() -> None` — 자체 `ThreadPoolExecutor(max_workers=1)`. `tick`은 실행 중이면 None, 아니면 due인 pending 중 가장 이른 하나를 제출하고 id 반환. `recover`는 `failed`이면서 `reason == "AIGO 키 확인 필요"`인 항목을 `pending`(attempts 0)으로.
  - 한 건 처리: metadata의 `clip`이 없거나 `sha256_file(clip) != clip.sha256` → `failed`("클립 확인 실패"), 요청 없음. 성공 → `uploaded`. `UploadDeferred` → attempts+1, `next_attempt_at = retry_at or now + retry_delay(attempts)`. `UploadRejected` → `failed`, reason.
  - `metadata.json`은 읽기만 한다.

- [ ] **Step 1: 실패하는 테스트** (가짜 client, 실제 `IncidentStore`+tmp_path, executor 결과는 `uploader.close()` 또는 future 대기로 동기화)
  - `test_mark_pending_is_idempotent`, `test_no_state_file_is_never_uploaded`
  - `test_success_marks_uploaded_and_never_retries`
  - `test_deferred_backs_off_with_retry_delay`, `test_deferred_with_retry_at_uses_it`
  - `test_auth_rejection_fails_then_recover_requeues_once`
  - `test_digest_mismatch_fails_without_request`
  - `test_submit_failure_stays_pending`
  - `test_upload_does_not_touch_metadata` (처리 전후 `metadata.json` 바이트 동일)
  - `test_one_upload_at_a_time`
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit `feat: AIGO upload queue per incident`

### Task 7: 파이프라인·세션·데스크톱 연결

**Files:**
- Modify: `src/dashpi/pipeline.py` (`IncidentPipeline.__init__`에 `on_clip: Callable[[IncidentMetadata], None] | None = None`; `process()`의 클립 성공 직후, `generate_report` 전에 호출, 예외는 `logging.getLogger("dashpi").exception` 후 무시)
- Modify: `src/dashpi/device_session.py` (`DeviceSession.__init__`에 `on_clip=None` 저장, `tick`의 `IncidentPipeline(...)`에 전달)
- Modify: `src/dashpi/desktop.py` (`main`: `load_aigo_config()`가 있으면 `AigoUploader` 생성, `on_clip=lambda i: mark_pending(store, i.incident_id)`로 `DeviceSession`에 전달, 창에 uploader 전달. `DashPiWindow`: 선택 인자 `uploader=None`; 있으면 시작 시 `recover()` 후 10초 `QTimer`로 `tick()`(예외는 로그만), 종료 시 `close()`. 녹화기록 상세의 사고 항목에 `report_text` 아래 작은 `QLabel` `aigo_status`: `aigo.json` 없으면 숨김, 있으면 "AIGO: 업로드 대기" / "AIGO: 업로드 완료" / "AIGO: 업로드 실패 · <reason>")
- Test: `tests/test_pipeline.py`, `tests/test_device_session.py`, `tests/test_desktop.py`

**Interfaces:**
- Consumes: Task 6 `mark_pending`, `AigoUploader`, `AIGO_STATE`; Task 5 `load_aigo_config`

- [ ] **Step 1: 실패하는 테스트**
  - `test_on_clip_called_after_clip_before_analysis` (analyze 호출 시점에 콜백이 이미 불렸고 clip.sha256 있음)
  - `test_on_clip_error_does_not_change_incident` (콜백이 예외 → 최종 상태 READY 그대로)
  - `test_clip_failure_does_not_call_on_clip`
  - `test_device_session_passes_on_clip`
  - `test_offline_video_never_marks_pending` (`analyze_external_video` 후 `aigo.json` 없음)
  - `test_upload_tick_exception_is_logged` (uploader.tick이 예외 → 창 살아 있음)
  - `test_detail_shows_aigo_status` (pending/uploaded/failed 문구, 파일 없으면 라벨 숨김)
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `.venv/bin/python -m pytest -q` 전체 PASS
- [ ] **Step 5:** README "AIGO 업로드(선택)" 절: `aigo.env` 위치·권한, 키 발급은 AIGO 저장소 README 참조, 키가 없으면 업로드 안 함
- [ ] **Step 6:** Commit `feat: upload incident clips to AIGO when configured`

### Task 8: 실제 연결 확인

- [ ] AIGO: PR `feat/dashpi-upload` → `dev`. 머지·배포는 사용자 확인 후(`railway up`은 api·worker·web 모두. 마이그레이션 0006은 api 시작 시 적용)
- [ ] 키 발급: `uv run python scripts/create_dashpi_key.py <사용자 이메일>` (운영 DB `DATABASE_URL`) → 출력 키를 Pi `~/.config/dashpi/aigo.env`에
- [ ] 데스크톱 또는 Pi에서 사고 분석 버튼 → Pi 레포트·QR 정상 + 상세에 "AIGO: 업로드 완료" → 같은 계정 웹·앱 목록에 DashPi 배지 분석이 나타나 완료
- [ ] `aigo.env` 제거 후 재시작 → 업로드 표시 없음, 기존 동작
- [ ] DashPi PR `feat/aigo-upload` → `dev`
