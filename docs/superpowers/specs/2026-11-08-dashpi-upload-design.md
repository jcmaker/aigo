# DashPi 사고 클립 AIGO 업로드 설계

작성일: 2026-11-08 · 상태: 검토 대기

표기: **[사용자]** 는 사용자가 직접 정한 내용, **[Claude 판단]** 은 사용자가 맡겨서 Claude가 정한 내용이다.

## 1. 의도

DashPi에서 사고 분석 버튼을 누르면 두 일이 동시에 일어난다. [사용자]

1. **새로 추가:** 잘라낸 사고 클립(`clip.mp4`)을 AIGO 서버에 올리고, AIGO 방식(worker)으로 분석한다. 결과는 같은 계정으로 로그인한 AIGO 웹과 AIGO 앱의 분석 목록에 보인다. 이 항목에는 DashPi 배지가 붙는다.
2. **기존 그대로:** Pi가 직접 분석하고 레포트를 만들어 광학 QR로 보여준다.

둘은 서로를 기다리지 않는다. 한쪽이 실패해도 다른 쪽에 영향이 없다. [사용자: "그냥 동시에 일어나는 거"]

캡스톤 시연에서 "DashPi 블랙박스 → AIGO 서비스"가 실제로 이어진다는 것을 보여주는 기능이다.

## 2. 목표와 비목표

**목표**

- 사고 버튼으로 만든 클립이 AIGO에 올라가 worker가 분석하고, 같은 계정의 웹·앱 목록과 상세에서 보인다. [사용자]
- 웹·앱에서 DashPi에서 온 분석은 배지로 구분된다. [사용자]
- 기존 DashPi 기능(로컬 분석, 재시도, 광학 QR, Local Wi-Fi)과 기존 AIGO 업로드는 동작이 바뀌지 않는다. [사용자: "기존 기능들은 그대로 작동, 추가만"]

**비목표** [Claude 판단]

- 외부 영상 분석(`offline_video.py`)과 다시 분석으로 만든 결과는 올리지 않는다. 사고 버튼으로 만든 클립만 올린다. [사용자 승인]
- Pi 레포트(로컬 분석 결과)는 올리지 않는다. 서버는 영상만 받아 자체 분석한다.
- 웹에서 API Key를 발급하는 화면은 만들지 않는다.
- 이 기능이 생기기 전의 과거 사고 기록은 올리지 않는다.

**반목표**(이러면 실패)

- 업로드 때문에 Pi 녹화·분석·QR이 느려지거나 멈춤
- 인터넷이 없을 때 Pi 동작이 깨짐
- 같은 클립이 AIGO에 여러 번 올라감
- 키가 없는 Pi가 지금과 다르게 동작함

## 3. 결정 사항

### 3.1 흐름

```
[Pi] 사고 버튼 → 클립 저장(SHA-256) ─┬─> 기존: Pi 분석 → 레포트 → QR  (변경 없음)
                                    └─> 신규: 업로드 대기 표시 → 업로더 스레드
                                              POST /api/v1/analyses   (API Key)
                                              PUT  presigned URL      (clip.mp4)
                                              POST /analyses/{id}/submit
[AIGO] worker 분석 → 완료 → 웹/앱 목록(DashPi 배지), 기존 푸시 알림
```

- **올리는 시점:** 클립 저장과 지문 확인이 끝난 직후. Pi 분석 결과를 기다리지 않는다. [사용자 승인]
- 서버에는 새 업로드 API가 없다. 웹·앱과 같은 3단계 API를 쓴다. [Claude 판단]
- `trim`은 보내지 않는다. 클립은 약 45초라 서버 한도 120초 안이다. [Claude 판단]

### 3.2 인증: Clerk API Key [사용자 승인]

- Pi는 사용자 계정에 묶인 Clerk API Key(`ak_` 접두어)를 `Authorization: Bearer`로 보낸다.
- AIGO Clerk 앱은 `aigo` 하나이고 development 인스턴스만 있다. API Keys 기능은 2026-11-08 사용자가 대시보드(Configure → Developers → API keys)에서 켰다. 사용자·조직이 직접 키를 만드는 옵션은 끄고, 키는 Backend API로 해당 사용자를 subject로 발급한다. [사용자]
- **API Key는 분석 생성(`POST /analyses`)과 제출(`POST /analyses/{id}/submit`)에서만 받는다.** 기존 `current_user`(세션 토큰 전용)는 바꾸지 않는다. 두 라우트만 세션 토큰과 API Key를 모두 받는 별도 의존성을 쓴다. 이렇게 해서 Pi 키로 삭제, 주문, 결제, `me`, 푸시 기기 등록을 할 수 없게 한다. [Claude 판단]
- 이 의존성은 설치된 `clerk-backend-api` 7.1.0으로 `/api_keys/verify` 검증을 한다(네트워크 호출, `CLERK_SECRET_KEY` 사용).
- 인증 서비스 장애는 401이 아니라 503으로 구분한다. 검증 결과의 `reason`이 서버 또는 네트워크 오류이면 기존 `AUTH_PROVIDER_UNAVAILABLE`(503)로 돌려준다. [Claude 판단]
- API Key 검증 응답에는 `sub`가 없고 `subject`가 있다. `subject`가 `user_`로 시작할 때만 그 Clerk 사용자로 인정한다. 조직 키(`org_`) 등은 401. `revoked` 또는 `expired`가 참이면 401. [Claude 판단]
- 세션 토큰 경로(웹·앱)는 지금과 똑같이 동작해야 한다.
- 키 발급은 Clerk 대시보드에서 API Keys 기능을 켜고, 해당 사용자를 subject로 키를 만든다. 발급 절차는 README에 적는다.

### 3.3 출처 표시 (DashPi 배지)

- `analyses`에 `source` 열을 추가한다: `upload`(기본) 또는 `dashpi`. Alembic 마이그레이션 `0006`. 기존 행은 `upload`. [Claude 판단]
- 값은 클라이언트가 보내지 않고 **인증 방식에서 정한다**. API Key로 만든 분석은 `dashpi`, 세션 토큰은 `upload`. 웹 사용자가 배지를 흉내 낼 수 없게 하려는 것이다. [Claude 판단]
- `AnalysisOut`에 `source`를 추가한다. OpenAPI를 다시 만들고 웹·앱 타입을 다시 생성한다.
- 웹: 분석 목록(`AnalysisList.tsx`)과 상세(`AnalysisDetail.tsx`)에 기존 `Badge` 부품으로 "DashPi" 배지. 앱: `AnalysisRow.tsx`와 상세 화면에 기존 ui 부품과 `theme.ts` 토큰으로 같은 배지. 색 값을 직접 적지 않는다.

### 3.4 서버 규칙은 그대로 [사용자 승인]

- 동의: Pi는 `consent: true`를 보낸다. API Key를 Pi에 넣는 행위를 업로드 동의로 본다. README에 적는다.
- 하루 한도(사용자 5건, 전체 100건), 영상 200MB 제한은 그대로 적용한다.
- 완료 푸시는 기존 `push.notify_analysis`가 그대로 보낸다(같은 계정 앱).

### 3.5 DashPi 설정값

`~/.config/dashpi/aigo.env` (권한 600, `ai.env`와 같은 형식). 저장소에 `aigo.env.example` 추가.

```
DASHPI_AIGO_API_URL=https://api-production-68ccb.up.railway.app
DASHPI_AIGO_API_KEY=ak_...
```

- 읽기는 `ai_client.py`의 `_read_env_file`, URL 검사는 `_valid_base_url`(https, 루프백만 http)을 재사용한다. 환경변수 `DASHPI_AIGO_*`가 파일 값을 덮어쓴다(`ai.env`와 같은 규칙).
- 키가 없으면 업로드 기능은 꺼진다. 업로드 대기 표시도 만들지 않는다. Pi는 지금과 완전히 같다.
- 새 Python 의존성은 추가하지 않는다. HTTP는 `urllib`. [Claude 판단]

### 3.6 DashPi 업로드 동작

- **대상 표시:** 클립 저장 직후, 업로드가 켜져 있으면 사고 폴더에 `aigo.json`(`{"state": "pending"}`)을 원자적으로 쓴다. 이 파일이 없는 사고(과거 기록, 외부 영상)는 업로드 대상이 아니다. [Claude 판단]
- 업로드 상태를 `metadata`가 아니라 별도 파일에 두는 이유: Pi 분석 스레드가 같은 시간에 `metadata`를 저장하므로, 따로 두어야 서로 덮어쓰지 않는다. [Claude 판단]
- 클립 저장 직후를 알기 위해 `IncidentPipeline`에 선택 인자 `on_clip`(콜백, 기본 None)을 추가하고, `process()`에서 클립 성공 직후 호출한다. 사고 버튼 경로의 파이프라인은 `device_session.py`의 `DeviceSession.tick`에서 만들어지므로 `DeviceSession`에도 같은 선택 인자를 추가해 넘긴다. 콜백 예외는 삼키고 로그만 남긴다. 기존 호출부는 바꾸지 않는다. 외부 영상 경로(`offline_video.py`)는 콜백을 넘기지 않는다.
- **업로더:** 분석 worker와 별도인 단일 스레드. 데스크톱 앱의 기존 타이머 방식(`AnalysisRetrier`와 같은 틱 구조)으로 `pending`이고 재시도 시각이 지난 사고를 하나씩 처리한다. 앱 시작 시에도 남은 `pending`을 이어서 처리한다.
- **올리기 전 지문 확인:** `clip.mp4`의 SHA-256이 `metadata`의 값과 같을 때만 올린다.
- **상태와 오류 처리** (`aigo.json`의 `state`):

| 상황 | 처리 |
|------|------|
| 성공 | `uploaded`, `analysis_id`, `uploaded_at` 기록 |
| 네트워크 오류, 408, 5xx | `pending` 유지, 1·2·5·10·30분 간격 재시도 (`ai_client.retry_delay` 재사용) |
| 429 (한도) | `pending` 유지, 다음 날 00:05(현지 시각) 재시도 |
| 401, 403 | `failed`, 이유 "AIGO 키 확인 필요". 자동 재시도 없음. 앱이 다시 시작될 때 이 이유로 실패한 항목은 한 번 `pending`으로 되돌린다(키를 고친 뒤 재시작하면 올라간다). [Claude 판단] |
| 그 밖의 4xx (크기 초과 등) | `failed`, 서버 메시지 기록 |

- **중복 방지:** `uploaded`가 된 사고는 다시 올리지 않는다. 한 시도 안에서 생성·PUT·제출을 끝까지 한다. 중간에 실패하면 다음 시도는 새 분석을 만든다. [Claude 판단]
  - 알려진 한계: 중간 실패로 남은 `created` 행이 그날 사용자 한도 1건을 쓴다. 재업로드용 서버 API를 추가하면 없앨 수 있지만 지금은 하지 않는다.
- **Pi 화면:** 녹화기록 상세에 작은 한 줄 "AIGO: 업로드 대기 / 업로드 완료 / 업로드 실패(이유)". 업로드 꺼짐이면 아무것도 표시하지 않는다. 팝업이나 홈 화면 변경은 없다. [사용자 승인]

## 4. 제약

- Pi 5, 단일 분석 worker 스레드, 저장 공간 관리(`prune_raw`)가 이미 있다. 업로드는 클립 파일만 읽고 원본 세그먼트를 보호 목록에 넣지 않는다(클립은 사고 폴더에 따로 있다).
- AIGO API는 `dev` 브랜치에 PR로 합친다(트렁크 기반). DashPi는 자체 저장소에서 별도 PR.
- DashPi 저장소에 커밋하지 않은 `desktop.py`, `tests/test_desktop.py` 변경이 있다. 작업 전에 정리 방법을 사용자에게 확인한다.
- 테스트: AIGO는 `uv run pytest`, 웹 `pnpm vitest run && pnpm build`, 앱 `pnpm exec tsc --noEmit && pnpm test`. DashPi는 `pytest`. Clerk 검증과 S3는 기존 테스트처럼 가짜로 바꿔 끼운다.

## 5. 빌더에게 맡기는 것

- 업로더 클래스와 파일 배치, `aigo.json` 세부 필드
- 배지 문구와 위치의 세부(목록 행 안에서 상태 배지 옆 등)
- 테스트 구성. 단, 아래는 반드시 검증한다:
  - API Key(`user_` subject)로 분석 생성 시 `source=dashpi`, 세션 토큰은 `upload`
  - `org_` subject, revoked 키는 401
  - API Key로 삭제·주문·`me`·기기 등록 호출은 401
  - Clerk 검증 서비스 장애는 503
  - Pi: 키 없음 → `aigo.json` 생성 안 함, 기존 흐름 동일
  - Pi: 오류 종류별 상태 전이(위 표)와 `uploaded` 후 재업로드 없음
  - Pi: 업로드 실패가 사고 상태(`ready` 등)를 바꾸지 않음

## 6. 완료 기준

실기 시나리오: Pi(또는 데스크톱 실행)에 `aigo.env`를 넣고 사고 분석 버튼을 누른다. Pi는 기존처럼 레포트와 QR을 보여주고, 같은 계정의 AIGO 웹과 앱 목록에 DashPi 배지가 달린 분석이 나타나 레포트까지 완료된다. `aigo.env`를 지우면 Pi는 업로드 없이 기존과 같이 동작한다.
