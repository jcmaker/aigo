# 0022. main에 머지되면 Railway에 자동 배포한다

- 상태: 채택 (ADR 0007의 "배포는 따로 한다" 부분을 대체)
- 날짜: 2026-11-09
- 변경 작업자: 조준형 (jcmaker), Claude Code 사용
- 관련 PR: 자동 배포 PR

## 작업 내용
- GitHub Actions 워크플로 "운영 배포"(`.github/workflows/deploy.yml`)를 둡니다.
- `main`에 PR이 머지되고 CI가 통과하면 Railway production에 배포합니다.
- 바뀐 폴더에 맞는 서비스만 배포합니다.
  - `apps/api`가 바뀌면 api → 상태 확인 → worker 순서로 배포합니다. api가 시작할 때 DB 마이그레이션을 하므로 worker보다 먼저 올립니다. api 상태 확인이 실패하면 worker와 web은 배포하지 않습니다.
  - `apps/web`이 바뀌면 web을 배포하고 상태 확인을 합니다.
  - 문서나 앱(`apps/app`)만 바뀌면 배포하지 않습니다. 앱은 APK 릴리즈로 배포합니다(ADR 0004).
- Actions 탭에서 손으로 실행할 수도 있습니다(전체, api만, web만).
- 배포는 한 번에 하나씩 하고, 진행 중인 배포를 끊지 않습니다.
- Railway CLI는 5.71.0으로 고정합니다. 인증은 GitHub 저장소 비밀값 `RAILWAY_TOKEN`(production 환경 Project Token)입니다. 토큰은 관리자가 넣습니다.
- 포크나 PR에서 온 CI 결과로는 배포하지 않습니다. 이 저장소 `main`에 푸시된 커밋만 배포합니다.

## 변경 사유
`main`에 머지해도 관리자가 직접 `railway up`을 하지 않으면 운영에 반영되지 않았습니다. 팀원이 참여하면 배포를 잊어 운영과 `main`이 어긋나기 쉽습니다. `main`은 검사 5개와 관리자 승인을 거쳐야 들어오므로 자동 배포를 걸어도 안전하다고 판단했습니다. 조준형이 GitHub Actions 방식(A)을 골랐습니다.

Railway 자체 GitHub 자동 배포는 api와 worker를 동시에 올려서, 새 DB 칸이 생기기 전에 새 worker가 돌 수 있습니다. 그래서 순서를 지킬 수 있는 Actions를 골랐습니다.

## 영향
- `main` 머지 = 운영 배포입니다. `dev`는 배포하지 않습니다.
- 배포 중 worker가 재시작되면 분석 중인 작업은 10분 뒤 한 번 다시 시도됩니다(ADR 0011의 실패 처리).
- 토큰이 없으면 배포 워크플로는 "토큰 확인" 단계에서 실패하고 안내를 남깁니다.
- 손으로 배포(`railway up`)도 계속 할 수 있습니다.
