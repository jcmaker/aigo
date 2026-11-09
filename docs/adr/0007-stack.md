# 0007. 서비스 구성: 모노레포와 기술 스택

- 상태: 채택
- 날짜: 2026-11-05
- 변경 작업자: 조준형 (jcmaker) 결정, Claude(AI) 세부 설계 후 조준형 승인
- 관련: 설계 `docs/superpowers/specs/2026-11-05-dashpi-design.md` 3장, PR #2~#13

## 작업 내용
- 저장소 하나에 `apps/api`(FastAPI API와 분석 worker, 같은 코드·이미지), `apps/web`(Next.js), `apps/app`(Expo 모바일 앱)을 둡니다.
- 운영은 Railway입니다: web, api, worker, Postgres, Bucket(S3 호환). api는 시작할 때 `alembic upgrade head`를 돌립니다.
- 분석 작업 대기열은 Redis 없이 Postgres `FOR UPDATE SKIP LOCKED`로 처리합니다.
- 영상은 api와 worker가 같이 볼 수 있게 Bucket에 둡니다. 로컬 개발은 `docker compose`로 Postgres와 S3 호환 저장소를 띄웁니다.
- Python 3.12, SQLAlchemy 2와 Alembic, Next.js App Router와 TypeScript, Tailwind v4를 씁니다.
- 서비스 이름은 AIGO이고, DashPi는 판매하는 블랙박스 상품 이름입니다.

## 변경 사유
- 스택(Railway, FastAPI, Next.js)은 조준형이 정했습니다.
- 분석은 수십 초에서 수 분 걸리고 메모리를 많이 써서 API 프로세스와 나눴습니다.
- 서비스가 다르면 디스크를 공유할 수 없어 영상은 Bucket에 둡니다.
- 대기열용 서비스를 따로 두지 않으려고 이미 쓰는 Postgres로 대기열을 처리합니다.

## 영향
- 배포는 `railway up --service <이름>`으로 따로 합니다. GitHub 머지가 배포를 일으키지 않습니다.
- api를 먼저 배포한 뒤 worker를 배포합니다(마이그레이션이 api 시작 때 돌기 때문).
- 영상 분석 모델에 쓰는 `ultralytics`는 AGPL-3.0입니다. 상용화하려면 라이선스를 다시 검토해야 합니다.
