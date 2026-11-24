# 0050. 앱 아이콘을 남색 원형 그라데이션 + 흰 AIGO 글자 + O 안 빨간 점으로 바꾼다

- 상태: 제안
- 날짜: 2026-11-25
- 변경 작업자: 최혜지 (marong9087), Claude(AI)
- 관련 PR: (올린 뒤 채움)

## 작업 내용
- 새 아이콘: 가운데 밝은 남색(#2C4E8C)에서 모서리 짙은 남색(#0A1434)으로 퍼지는 원형 그라데이션 바탕에, 앱 로고와 같은 흰 AIGO 글자(`wordtext-light.png`)를 두고 O 안에 빨간 점(#F04438)을 넣었다. 점은 블랙박스 녹화(● REC)를 뜻한다.
- `apps/app/scripts/app_icon.py`(새 파일)가 아이콘을 만든다. `brand.py`가 만드는 기존 파일(`icon-dark.png`, `adaptive-*.png`, 스플래시 레이어)은 건드리지 않는다.
  - `assets/brand/app-icon.png`(1024, 기본·iOS·웹 favicon)
  - `assets/brand/app-icon-bg.png`(안드로이드 적응형 배경), `app-icon-fg.png`(앞 그림, 글자 폭 470px로 가운데 보이는 영역 안), `app-icon-mono.png`(안드로이드 13+ 테마 아이콘용 흰 모양)
- `apps/app/app.json`: `icon`, `web.favicon` → `app-icon.png`, `android.adaptiveIcon` → 위 세 파일(`backgroundImage` 추가), `backgroundColor` #1C1C1C → #1A2B4C.
- 앱 안 로고(`Wordmark`), 시작 화면(`Splash`)은 바꾸지 않았다.

## 변경 사유
기존 아이콘은 검은 바탕(#1C1C1C)에 심볼만 있어 앱 화면의 남색·민트 색감과 맞지 않았다. 여러 시안(대각선·원형 그라데이션, GO 민트, 점 색)을 비교해 최혜지가 H3(원형 남색 그라데이션 + 흰 글자 + 빨간 점)를 골랐다. 앱 머리글과 같은 남색 계열이고, 흰 글자는 작은 크기에서도 잘 읽히며, 빨간 점이 블랙박스 영상을 다루는 앱이라는 뜻을 준다.

## 영향
- 아이콘은 네이티브 빌드에 들어가므로 새 APK(버전 올림)를 만들어야 기기에 보인다. JS 업데이트만으로는 바뀌지 않는다.
- 확인: `pnpm exec tsc --noEmit`, `pnpm test`(132개 통과, 코드 변경 없음). 기본 아이콘과 안드로이드 원형·둥근 네모·흑백 테마 모양을 이미지로 잘라 봤다. 실제 기기 런처에서는 아직 보지 않았다.
