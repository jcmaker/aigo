# 분석 진행 화면: 살아 있는 체크리스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 분석 진행 화면이 단계 안에서도 계속 움직이게 한다(경과 초, 회전 링, 바뀌는 안내 문구, 차오르는 막대).

**Architecture:** 진행 계산은 순수 함수(`src/lib/progress.ts`)로 떼어 시각을 인자로 받아 테스트한다. 화면은 1초 타이머 훅으로 `now`를 넘기고, 모션은 React Native `Animated`(네이티브 드라이버)만 쓴다. 서버·API는 그대로.

**Tech Stack:** Expo SDK 58 / React Native, TypeScript, jest-expo + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-11-21-analysis-progress-live-design.md`

## Global Constraints

- `apps/api`, 웹(`apps/web`)은 바꾸지 않는다. 새 의존성을 넣지 않는다.
- 안내 문구에 숫자(0-9)를 넣지 않는다. 진행 중 막대는 100%가 되지 않는다(완료일 때만 100%).
- 경과 시간은 첫 단계 기록의 `at`부터 센다. 단계 기록이 없으면(대기열) 세지 않고 제목은 "곧 분석을 시작해요".
- 끝난 단계의 소요 초는 표시하지 않는다.
- 서버·폰 시각 차이로 음수가 나오면 0.
- "동작 줄이기"가 켜져 있으면 회전·빛 효과를 끈다.
- 진행 중 단계의 접근성 라벨에 경과 초를 넣지 않는다.
- 실패·중단·연결 불안정 문구와 "화면을 닫아도…" 안내는 지금 문구 그대로.
- 색은 `src/theme.ts` 토큰만(`brand`, `brand200`, `brand400`, `gray4`, `gray11`, `gray12`, `online`).

## Review Focus

1. 진행 중인 단계의 `progress` 항목이 아직 없을 때(폴링 사이 `stage`만 바뀜): 단계 경과 초는 숨기고 막대는 끝난 단계까지만 — Task 1 테스트 `current stage without running entry`.
2. `at`이 폰 시각보다 미래(시계 차이): 0초로 보인다 — Task 1 `clock skew`.
3. 단계가 예상보다 훨씬 오래 걸림: 막대가 다음 단계 칸을 넘지 않는다(최대 0.9칸) — Task 1 `long stage caps`.
4. 실패한 분석: 회전·타이머 없이 지금 실패 화면 — Task 2 `failed shows no timer`.
5. 화면이 백그라운드로 가면 1초 타이머가 멈춘다 — Task 2 `useNow` 구현 단계(AppState).

---

### Task 1: 진행 계산과 안내 문구

**Files:**
- Create: `apps/app/src/lib/progress.ts`, `apps/app/src/lib/progress.test.ts`
- Modify: `apps/app/src/lib/analysis.ts:58-65` (STAGES에 `hints` 추가, 문구를 "~해요"체 `doing`으로)

**Interfaces:**
- Produces:
  - `STAGES[i].hints: string[]` (2~4개, 숫자 없음)
  - `type Live = { current: number; finished: boolean; elapsedSec: number | null; stageSec: number | null; ratio: number }`
  - `liveProgress(a: Pick<Analysis, 'status' | 'stage' | 'progress'>, nowMs: number): Live` — `current`는 STAGES 인덱스(대기 -1), `ratio` 0~1
  - `hintAt(stageIndex: number, stageSec: number): string` — 2.6초마다 다음 문구, 순환
  - `EXPECTED_SEC: Record<string, number>`: normalize 5, scan 20, locate 5, focus 3, observe 30, assess 25 (`// ponytail: 추정값, 운영 로그로 단계별 중앙값을 재면 바꾼다`)

- [ ] **Step 1: 실패하는 테스트 작성** (`progress.test.ts`, `now = Date.parse('2026-11-21T06:00:30Z')`)
  - `queued`: progress `[]`, status `queued` → `{ current: -1, elapsedSec: null, stageSec: null, ratio: 0, finished: false }`
  - `running`: normalize done at `06:00:05Z`, scan running at `06:00:10Z`, stage `scan` → `current 1`, `elapsedSec 25`, `stageSec 20`, `ratio ≈ (1 + min(20/20, 0.9)) / 6`
  - `current stage without running entry`: stage `locate`, progress에 normalize·scan done만 → `stageSec null`, `ratio 2/6`
  - `clock skew`: scan running at `06:00:40Z` → `stageSec 0`, `elapsedSec`도 0 이상
  - `long stage caps`: observe running 300초 → `ratio < 5/6`
  - `done`: status `done` → `finished true`, `ratio 1`
  - `hintAt(4, 0)`과 `hintAt(4, 2.6)`이 다르고 `hintAt(4, 2.6 * STAGES[4].hints.length)`는 `hintAt(4, 0)`과 같다
  - 모든 `STAGES[].hints`가 `/[0-9]/`에 걸리지 않고 길이 2~4

- [ ] **Step 2: 실패 확인** — `cd apps/app && pnpm test src/lib/progress.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 구현** — `analysis.ts` STAGES에 hints와 새 `doing` 문구(시안 A 문구: "영상을 준비하고 있어요", "차와 사람을 따라가고 있어요", "충돌 순간을 찾고 있어요", "볼 장면을 고르고 있어요", "AI가 장면을 읽고 있어요", "과실 기준과 맞춰 보고 있어요"). 힌트는 시안 A에서 숫자 들어간 것을 빼고 쓴다. `progress.ts`는 `progress` 배열에서 단계별 항목을 찾아 계산. `elapsedSec`의 시작은 progress 첫 항목 `at`.

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `pnpm exec tsc --noEmit` 통과

- [ ] **Step 5: 커밋** — `feat(app): 분석 진행 계산과 단계 안내 문구`

### Task 2: 진행 화면 UI

**Files:**
- Modify: `apps/app/src/components/analysis.tsx:96-129` (`ProgressView`)
- Modify: `apps/app/src/components/ui/StepList.tsx` (진행 중 단계: 회전 링 + 오른쪽 `n초` + 파란 안내 문구, 끝난 단계: 체크 튀어나옴)
- Create: `apps/app/src/lib/use-now.ts` (`useNow(active: boolean): number` — 1초 `setInterval`, `AppState`가 active가 아니면 멈춤), `apps/app/src/lib/use-reduce-motion.ts` (`useReduceMotion(): boolean`, `AccessibilityInfo`)
- Modify: `apps/app/src/lib/ui-logic.ts`(쓰지 않게 되는 `stageSegments` 삭제)와 그 테스트
- Test: `apps/app/src/components/report.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `liveProgress`, `hintAt`, `STAGES`
- Produces: `StepList` props `{ steps: { title: string; detail?: string; time?: string }[]; current: number; state: 'running' | 'done' | 'failed'; reduceMotion?: boolean }`

- [ ] **Step 1: 실패하는 테스트 작성** (`report.test.tsx`, `jest.useFakeTimers().setSystemTime(...)`로 시각 고정)
  - 기존 `진행 화면은 단계 4/6을 보인다`를 `4/6 단계` 텍스트로 바꾼다
  - `running shows elapsed`: scan running 20초 전 → `경과 0:25`와 `20초` 텍스트
  - `queued`: `곧 분석을 시작해요` 보이고 `경과` 없음
  - `failed shows no timer`: status failed → `분석을 끝내지 못했습니다`, `경과` 없음
  - 진행 중 단계 접근성 라벨이 `2단계 객체 추적 진행 중`(초 없음)

- [ ] **Step 2: 실패 확인** — `pnpm test src/components/report.test.tsx` → FAIL

- [ ] **Step 3: 구현** — 위 카드: `n/6 단계`·`경과 m:ss`(formatTime) 한 줄, 24px 800 제목, 안내 문구(페이드 300ms), 8px 막대(`ratio` 폭, 빛 띠 1.6초 반복; 완료면 `online` 색). SegmentGauge는 진행 화면에서 뺀다. 회전은 `Animated.loop` 900ms, 체크 등장은 `Animated.spring` scale 0.4→1. `reduceMotion`이면 회전·빛 띠·튀어나옴 없음.

- [ ] **Step 4: 통과 확인** — `pnpm test` 전체 PASS, `pnpm exec tsc --noEmit` 통과

- [ ] **Step 5: 커밋** — `feat(app): 분석 진행 화면에 경과 시간과 움직임 추가`

### Task 3: 기록과 PR

**Files:**
- Create: `docs/adr/0033-app-analysis-progress-live.md` (작업자: 조준형(jcmaker), Claude(AI); 시안 캔버스 링크와 A를 고른 이유)
- Modify: `docs/adr/README.md` (목록 한 줄)
- 포함: 이 계획과 spec 파일

- [ ] **Step 1: 실기 확인** — `npx expo start --lan`으로 폰에서 분석 하나를 올려 진행 화면을 본다. 전·후 스크린샷을 남긴다(가능하지 않으면 PR에 "실기 미확인"이라고 쓴다).
- [ ] **Step 2: 커밋·PR** — 브랜치 `feat/app-progress-live`, `gh pr create --base dev`, 제목 `[앱] 분석 진행 화면에 경과 시간과 움직임 추가`, 본문은 PR 양식 다섯 칸.
- [ ] **Step 3: CI 확인** — `gh pr checks <번호>`; 통과하면 `gh pr merge --merge --admin`(관리자 PR).
