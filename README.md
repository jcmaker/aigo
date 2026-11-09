# AIGO

사고 영상을 올리면 AI가 충돌 구간을 찾고 사고 분석 레포트를 만드는 웹 서비스입니다. 판매 상품인 DashPi 블랙박스의 구매 흐름도 함께 제공합니다.

경기과학기술대학교 디자인공학과 캡스톤 프로젝트입니다. 가상 서비스이며 실제 상품을 판매하지 않고, 결제는 토스 테스트 환경에서만 동작합니다.

> AIGO의 결과는 영상 기반 AI 추정이며 법적 판단이 아닙니다.

## 주요 기능

- **랜딩과 상품:** 서비스 소개, DashPi 상품 2종, 토스 결제위젯 테스트 결제, 주문 내역
- **회원:** Clerk 개발 모드 기반 이메일과 소셜 로그인. 화면은 자체 디자인 시스템으로 구현
- **사고분석:** 영상 직접 업로드, 비동기 분석, 단계별 진행 표시, 근거 시각으로 이동하는 레포트, 객체 박스 표시, 인쇄용 레포트
- **API:** 웹과 추후 모바일 앱이 같이 쓰는 `/api/v1`. OpenAPI 스키마에서 웹 타입 생성

## 분석 방식

1. 영상을 고정 프레임률로 정리하고 YOLO와 ByteTrack으로 객체를 추적합니다.
2. 박스 변화, 화면 흔들림, 소리로 충돌 후보를 찾고 후보 구간을 촘촘히 추출합니다.
3. 비전 모델이 보이는 사실만 시각과 함께 기록합니다.
4. 모델은 손해보험협회 과실비율 도표와 수정요소를 고르고, 과실 범위는 코드가 계산합니다.
5. 근거 시각이 없는 주장은 코드가 제거하고, 확인할 수 없는 항목은 `unknown`으로 둡니다.

## 저장소 구조

```text
apps/
├── api/    FastAPI API, 분석 worker, 평가 도구
├── web/    Next.js 웹
└── app/    React Native(Expo) 모바일 앱
docs/       설계 문서와 구현 계획
```

## 기술 스택

| 영역 | 사용 기술 |
|------|-----------|
| 웹 | Next.js 16, TypeScript, Tailwind CSS 4, Clerk, 토스페이먼츠 SDK |
| API | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| 분석 | FFmpeg, OpenCV, Ultralytics YOLO, ByteTrack, OpenAI |
| 인프라 | Railway, Postgres, S3 호환 Bucket |
| 테스트 | pytest, Vitest, Playwright |

## 배포 주소

- 웹: https://aigo.up.railway.app
- API: https://api-production-68ccb.up.railway.app (상태 확인 `/api/v1/health`)

## 로컬 실행

Python 3.12(uv), Node 22(pnpm), ffmpeg, Postgres, S3 호환 저장소가 필요하다.

```bash
# 저장소: 실제 Bucket 대신 moto 서버를 쓸 수 있다. 버킷을 만들고 CORS(PUT, GET)를 열어 둔다.
cd apps/api
uv run --with 'moto[server]' moto_server -p 9100

# API와 worker: apps/api/.env.example을 .env로 복사해 값을 채운다. DATABASE_URL은 postgresql+psycopg:// 형식이다.
uv run alembic upgrade head && uv run python -m app.seed
uv run uvicorn app.main:create_app --factory --port 8000
uv run python -m app.worker

# 웹: apps/web/.env.example을 .env.local로 복사해 값을 채운다.
cd apps/web
pnpm install && pnpm dev --port 3100
```

앱은 `apps/app`에서 실행합니다. 네이티브 모듈을 쓰므로 Expo Go가 아니라 개발 빌드가 필요합니다.

```bash
cd apps/app
cp .env.example .env.local   # 공개 키와 API 주소를 채운다.
pnpm install
pnpm android                 # Android SDK, JDK 17 필요. 개발 빌드를 설치한다.
npx expo start --dev-client
```

네이티브 패키지를 추가한 뒤에는 `rm -rf android`로 지우고 다시 빌드합니다. 그대로 빌드하면 새 모듈이 빠질 수 있습니다.

디자인 시스템은 두 곳에 있습니다. 색, 간격, 모서리, 글자 크기는 `src/theme.ts`에, 버튼, 카드, 입력칸, 하단 메뉴 같은 공용 부품은 `src/components/ui/`에 있습니다. 화면은 이 둘만 가져다 쓰고 색 값을 직접 적지 않습니다.

로고, 앱 아이콘, 스플래시 이미지는 `assets/brand/source`의 원본 PNG에서 만듭니다. 원본을 바꾸면 다시 만들고, 그 뒤 `rm -rf android`로 네이티브를 다시 빌드합니다.

```bash
cd apps/app && uv run --with numpy --with pillow python -I scripts/brand.py
```

## 테스트

```bash
cd apps/api && uv run pytest          # 느린 YOLO 테스트 제외: -m 'not model'
cd apps/web && pnpm vitest run && pnpm build
cd apps/app && pnpm exec tsc --noEmit && pnpm test

# 전체 시나리오. 창을 띄운 Chrome으로 돌고, 실제 OpenAI를 호출한다. 사고 장면이 있는 클립을 쓴다.
cd apps/web && E2E_VIDEO=<영상 경로> BASE_URL=<웹 주소> pnpm playwright test e2e/journey.spec.ts
```

GitHub Actions(`.github/workflows/ci.yml`)가 `dev`·`main`으로 가는 PR과 푸시마다 위 세 줄을 돌린다. 느린 YOLO 테스트와 e2e는 CI에서 돌리지 않는다. 비밀값은 쓰지 않는다. 팀원 참여 방법은 [CONTRIBUTING.md](CONTRIBUTING.md), 결정 기록은 [docs/adr](docs/adr/README.md), AI 도구 규칙은 [AGENTS.md](AGENTS.md). 관리자가 아닌 사람의 PR은 "PR 가드레일" 검사가 본문(배경, 할 일, 한 일, 검증, 작업자)과 ADR을 확인하고 `apps/api` 변경을 막는다. "비밀값 검사"(gitleaks, `.gitleaks.toml`)는 모든 PR과 푸시에서 키·비밀번호·`.env` 파일을 찾고, PR이면 없애 달라는 댓글을 단다.

API 응답을 바꾸면 타입을 다시 만든다.

```bash
cd apps/web && TOSS_SECRET_KEY=test_x DATABASE_URL=postgresql:///dashpi_test \
  uv run --project ../api python ../api/scripts/dump_openapi.py && pnpm gen:api
```

## 환경변수

api와 worker (`apps/api/.env.example`)

| 이름 | 설명 |
|------|------|
| `DATABASE_URL` | `postgresql+psycopg://...` |
| `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | 비공개 Bucket |
| `S3_ADDRESSING_STYLE` | Railway Bucket은 `virtual`(path 주소에는 CORS 규칙이 적용되지 않는다), 로컬 moto는 기본값 `path` |
| `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` | Clerk 토큰 검증 |
| `CLERK_AUTHORIZED_PARTIES` | CORS와 Clerk 토큰이 함께 쓰는 웹 주소 JSON 배열. 비우면 `WEB_ORIGIN` 하나. 도메인을 추가하면 여기와 Bucket CORS에 함께 넣는다 |
| `WEB_ORIGIN` | 웹 주소(CORS) |
| `TOSS_SECRET_KEY` | `test_`로 시작하지 않으면 서버가 시작되지 않는다 |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT` | 분석 모델 |
| `MAX_VIDEO_BYTES`, `MAX_VIDEO_SECONDS`, `USER_DAILY_LIMIT`, `GLOBAL_DAILY_LIMIT` | 영상과 하루 한도 |

web (`apps/web/.env.example`)

| 이름 | 설명 |
|------|------|
| `NEXT_PUBLIC_API_URL` | API 주소. 빌드 때 번들에 들어간다 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 빌드 때 번들에 들어간다 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | `test_gck_` 테스트 키. 빌드 때 번들에 들어간다 |
| `CLERK_SECRET_KEY` | 서버 쪽 Clerk |

## DashPi 업로드 키

DashPi 블랙박스는 사고 클립을 잘라 저장하면 같은 계정으로 AIGO에 올린다. 올라간 분석은 웹과 앱 목록에 `DashPi` 배지로 보인다. Pi는 화면 로그인을 할 수 없으므로 계정에 묶인 Clerk API Key를 쓴다.

- Clerk 대시보드 Configure → Developers → API keys에서 기능을 켠다. 사용자·조직이 직접 키를 만드는 옵션은 끈다.
- API Key는 분석 생성(`POST /api/v1/analyses`)과 제출(`POST /api/v1/analyses/{id}/submit`)에서만 받는다. 다른 API는 401이다.
- 키 발급: `cd apps/api && uv run python scripts/create_dashpi_key.py <AIGO 로그인 이메일>`. 출력된 키를 Pi의 `~/.config/dashpi/aigo.env`에 넣는다(DashPi 저장소 `aigo.env.example` 참고).
- 키를 Pi에 넣는 것을 영상 분석 동의로 본다. Pi는 업로드할 때 `consent: true`를 보낸다. 하루 한도와 영상 크기 제한은 웹과 같다.

## Railway 배포

프로젝트 `AIGO`: `web`, `api`, `worker`, Postgres, Bucket `aigo-videos`. 모두 싱가포르 리전(`asia-southeast1-eqsg3a`, Bucket은 `sin`)에 있다. 설정은 서비스에 들어 있고 저장소에는 Dockerfile만 있다(Railway가 설정 파일 경로 지정을 더는 받지 않는다).

| 서비스 | Root Directory | 시작 명령 | 상태 확인 |
|--------|----------------|-----------|-----------|
| web | `apps/web` | Dockerfile CMD | `/` |
| api | `apps/api` | Dockerfile CMD(마이그레이션, 시드, uvicorn) | `/api/v1/health` |
| worker | `apps/api` | `python -m app.worker` | 없음 |

```bash
railway up --service api --detach   # 저장소 루트에서 실행한다. web, worker도 같다.
```

`railway up`은 작업 폴더를 그대로 올린다. 커밋하지 않은 변경이 있으면 `git archive HEAD`로 푼 폴더에서 `-p`, `-e`를 주고 실행한다.

`NEXT_PUBLIC_*`를 바꾸면 web을 다시 빌드해야 한다. Bucket CORS의 AllowedOrigins는 웹 주소들과 `http://localhost:3100`만 허용한다.

## 앱 릴리즈

Android APK는 [GitHub Releases](https://github.com/jcmaker/aigo/releases)에서 받습니다. 스토어 출시와 iOS 배포는 아직 하지 않았습니다.

1. `apps/app/app.json`의 `version`을 올리고, 기존 APK 위에 설치할 수 있게 `android.versionCode`도 올립니다.
2. `eas.json`의 `preview.env` 값을 환경변수로 넣습니다. 넣지 않으면 `.env.local`의 로컬 주소가 APK에 들어갑니다.
3. `rm -rf android`, `npx expo prebuild --platform android --no-install`, `cd android && ./gradlew assembleRelease` 순서로 빌드합니다.
4. `apksigner`로 다시 서명합니다. 키는 저장소 밖 `~/.aigo/`에 있고, 잃어버리면 같은 앱으로 업데이트할 수 없습니다.

## 평가 결과

**현재 분석 품질은 아직 합격선에 미달합니다.** 아래 값은 팀 확인 전 초안 정답으로 측정한 결과(초안 정답 기준, 2026-11-08, 36개 중 25개 채점)이며, 표본이 작습니다. 자세한 내용은 `apps/api/eval/results`에 있습니다.

| 지표 | 합격선 | 현재 |
|------|--------|------|
| 충돌 시각 1초 이내 | 80% | 7/18 (이전 3/18) |
| 정답 도표 선택 | 70% | 1/6 |
| 정답 과실이 범위 안에 포함 | 70% | 0/5 |
| 사고 없는 영상에 과실 표시 | 0건 | 0/7 (미정 영상 Cgsf는 이전 규칙에서 과실 표시, 수정 후 추정에서 제외) |
| 근거 시각 일치 | 표본 30개 이상, 90% | 38/39 (97%) (Claude 판정 26개 포함, 사람 확인 전) |

접촉 장면이 보이지 않아도 충돌음과 화면 흔들림이 함께 크게 나타나면 "충돌 추정"으로 표시합니다. 이때 과실비율은 영상에서 도표 근거를 찾은 경우에만 냅니다. 이 추정으로 충돌 시각 지표가 올랐지만 도표와 과실 범위는 거의 그대로입니다. 계획과 실험 기록은 [docs/analysis-quality.md](docs/analysis-quality.md)에 있습니다.

## 브랜치 전략

`dev`와 `main` 두 브랜치만 쓰는 트렁크 기반 전략입니다.

- `dev`: 기본 브랜치입니다. 기능별 PR을 이곳에 합칩니다.
- `main`: 배포 기준 브랜치입니다. `dev`에서 PR로만 반영합니다.
- 작업 브랜치는 짧게 쓰고 병합하면 지웁니다.

## 라이선스 안내

객체 추적에 쓰는 [ultralytics](https://github.com/ultralytics/ultralytics)(YOLO)는 AGPL-3.0이다. 이 서비스를 네트워크로 제공하면 AGPL-3.0의 소스 공개 의무가 적용되므로, 저장소 공개를 유지하거나 Ultralytics 기업 라이선스를 받아야 한다.
