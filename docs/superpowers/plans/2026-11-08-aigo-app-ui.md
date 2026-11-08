# AIGO 앱 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기능 확인용 최소 스타일인 Expo 앱에 디자인 시스템, 진입 모션, 하단 메뉴 5개를 입힌다. 기능은 바꾸지 않는다.

**Architecture:**
- **토큰:** `src/theme.ts` 한 파일에 둔다.
- **컴포넌트:** `src/components/ui/`에 두고, 계산 로직은 `src/lib/ui-logic.ts`의 순수 함수로 빼서 jest로 검사한다.
- **화면:** 화면 파일은 데이터와 동작을 그대로 두고 표시만 새 컴포넌트로 바꾼다.
- **탭:** expo-router 탭에 커스텀 `tabBar`를 연결한다.

**Tech Stack:** Expo SDK 58, Expo Router, React Native 0.88, `react-native-svg`(새로 추가), React Native `Animated`, jest-expo, `@testing-library/react-native`

**Spec:** `docs/superpowers/specs/2026-11-08-aigo-app-ui-design.md`

## Global Constraints

- 새 기능을 만들지 않는다. 지금 화면의 데이터, 문구, 동작(업로드 재시도, 구간 잠금, 공유받기, 알림 이동, 오프라인 현장 모드)을 그대로 유지한다.
- 새 의존성은 `react-native-svg` 하나만 `npx expo install react-native-svg`로 넣는다. 아이콘 라이브러리, reanimated 직접 사용, 글꼴은 넣지 않는다.
- 색은 spec "색" 표의 HEX 값을 그대로 쓴다(Supabase 테마 값과 `sceneIcon` `#FF7A5C`).
- 글자 단계, 간격(4 단위), 모서리(카드 24, 영상 20, 행·타일 16, 입력칸 14, 아이콘 상자 12, 버튼·칩·메뉴는 완전한 둥근 모양)는 spec 값을 따른다.
- 진입 모션은 약 1.4초다. A 0~0.45초, 길 0.3~1.0초, 별 1.0~1.4초, 글자 1.05초부터 나온다.
- 하단 메뉴 순서는 홈, 내 분석, 분석하기, 현장 모드, 계정이고 아이콘만 둔다. 각 버튼에 `accessibilityLabel`로 이 이름을 붙인다.
- 테스트 파일은 `src/lib/` 또는 `src/components/` 아래에 둔다. `src/app` 아래 파일은 라우트가 된다.
- 네이티브 모듈을 추가한 뒤에는 `rm -rf android` 후 `npx expo run:android`로 다시 빌드한다.
- 저장소는 공개다. 영상, 키, 서명 URL은 커밋하지 않는다. 로고 PNG는 커밋한다(spec "브랜드 파일").
- 각 작업 끝에 `pnpm exec tsc --noEmit`과 `pnpm test`(apps/app)가 통과해야 한다.

## Review Focus

1. **오프라인 첫 실행:** 앱을 처음 켤 때 Clerk가 끝내 로드되지 않아도 모션 뒤에 현장 모드 버튼이 보여야 한다. 모션 중에도 눌러야 한다. → Task 3의 `Splash` 테스트가 모션 중 버튼 노출을 확인한다.
2. **분석하기 탭이 남아 있을 때의 재시도:** 실패 뒤 다른 탭에 갔다 오면 같은 `attempt`로 재시도해야 한다. 새 분석을 만들어 하루 한도를 쓰면 안 된다. 공유로 새 영상이 오면 이전 `attempt`를 버린다. → Task 4의 `nextUploadState` 테스트
3. **과실 범위의 끝값:** 0%, 100%, 같은 값(`my_min === my_max`), 10의 배수가 아닌 값(예: 25~35)에서 칸 칠하기가 틀리지 않아야 한다. → Task 1의 `faultSegments` 테스트
4. **실패, 중단 단계의 진행 게이지:** 실패나 중단된 분석이 "진행 중"처럼 보이면 안 된다. → Task 1의 `stageSegments` 테스트
5. **로그인 전 현장 모드:** 로그아웃 상태의 `/scene`에는 하단 메뉴가 없어야 하고, 로그인 상태의 `/emergency`에서 사진으로 가면 `/scene/photos`가 열려야 한다. → Task 4의 라우트 테스트와 Task 8 기기 확인

---

### Task 1: 토큰, SVG, 순수 로직

**Files:**
- Create: `apps/app/src/theme.ts`
- Create: `apps/app/src/lib/ui-logic.ts`
- Test: `apps/app/src/lib/ui-logic.test.ts`
- Create: `apps/app/src/components/ui/Icon.tsx`
- Modify: `apps/app/package.json` (`react-native-svg`)

**Interfaces:**
- Produces:
  - `theme.ts`:
    - `color`: spec 색 표의 토큰 이름 그대로(`brand200`, `brand400`, `brand`, `brand600`, `ink`, `ink2`, `ink3`, `white`, `gray2`, `gray3`, `gray4`, `gray9`, `gray11`, `gray12`, `warning300`, `warning600`, `danger300`, `danger`, `danger600`, `sceneIcon`)
    - `space`: `{ 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32 }`
    - `radius`: `{ card:24, video:20, row:16, input:14, icon:12, pill:999 }`
    - `type`: `display`, `title`, `headline`, `body`, `label`, `caption`, `micro` (RN 텍스트 스타일 객체, spec 값)
    - `tabBarSpace`: 떠 있는 메뉴 높이(46 + 14 + 아래 여백 18)
  - `ui-logic.ts`:
    - `type Seg = 'on' | 'soft' | 'off'`
    - `faultSegments(min: number, max: number, n = 10): Seg[]`
    - `stageSegments(stageIndex: number, total: number, state: 'running' | 'done' | 'failed'): Seg[]`
    - `homeCounts(items: { status: string }[], capped: boolean): { total: string; done: number; running: number }`
  - `Icon.tsx`: `Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string })`
    - `IconName = 'home' | 'list' | 'video' | 'alert' | 'user' | 'back' | 'share' | 'chevron' | 'check' | 'camera' | 'phone' | 'lock' | 'upload' | 'trash' | 'image'`

- [ ] **Step 1: `react-native-svg` 설치**

Run: `cd apps/app && npx expo install react-native-svg`
Expected: `package.json` dependencies에 추가되고, `npx expo-doctor`가 통과한다.

- [ ] **Step 2: 실패하는 테스트 작성** (`src/lib/ui-logic.test.ts`)

```ts
import { faultSegments, homeCounts, stageSegments } from './ui-logic';

test('과실 범위는 겹치는 칸만 켠다', () => {
  expect(faultSegments(20, 40)).toEqual(['off','off','on','on','off','off','off','off','off','off']);
  expect(faultSegments(25, 35)).toEqual(['off','off','on','on','off','off','off','off','off','off']);
  expect(faultSegments(0, 0)).toEqual(['on', ...Array(9).fill('off')]);
  expect(faultSegments(100, 100)).toEqual([...Array(9).fill('off'), 'on']);
  expect(faultSegments(50, 50)[5]).toBe('on');
  expect(faultSegments(0, 100)).toEqual(Array(10).fill('on'));
});

test('진행 단계는 끝난 칸 on, 현재 칸 soft, 실패면 soft 없음', () => {
  expect(stageSegments(3, 6, 'running')).toEqual(['on','on','on','soft','off','off']);
  expect(stageSegments(-1, 6, 'running')).toEqual(Array(6).fill('off')); // 대기열
  expect(stageSegments(3, 6, 'failed')).toEqual(['on','on','on','off','off','off']);
  expect(stageSegments(5, 6, 'done')).toEqual(Array(6).fill('on'));
});

test('홈 숫자: 완료는 done, 분석 중은 queued+processing, 100건 상한은 100+', () => {
  const items = [{ status: 'done' }, { status: 'queued' }, { status: 'processing' }, { status: 'failed' }, { status: 'created' }];
  expect(homeCounts(items, false)).toEqual({ total: '5', done: 1, running: 2 });
  expect(homeCounts(items, true).total).toBe('100+');
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/app && pnpm test src/lib/ui-logic.test.ts`
Expected: FAIL (`Cannot find module './ui-logic'`)

- [ ] **Step 4: `ui-logic.ts`와 `theme.ts` 구현**

- `faultSegments`의 칸 i는 `[10i, 10i+10)` 구간이고, 마지막 칸만 100을 포함한다. 구간이 `[min, max]`와 겹치면 `on`이다. 점 범위(`min === max`)는 그 값을 포함하는 칸 하나만 켠다.
- `homeCounts`의 `capped`는 목록이 요청 상한(100)만큼 왔다는 뜻이다.

- [ ] **Step 5: 통과 확인**

Run: `cd apps/app && pnpm test src/lib/ui-logic.test.ts && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 6: `Icon.tsx` 구현**

`react-native-svg`의 `Svg`와 `Path`로 위 15개를 24×24 선 아이콘(stroke 2, round cap)으로 그린다. 시안 `design-system-v3.html`의 경로를 참고한다.

- [ ] **Step 7: 커밋**

```bash
git add apps/app/package.json pnpm-lock.yaml apps/app/src/theme.ts apps/app/src/lib/ui-logic.ts apps/app/src/lib/ui-logic.test.ts apps/app/src/components/ui/Icon.tsx
git commit -m "feat(app): 디자인 토큰, SVG 아이콘, 게이지와 홈 숫자 계산"
```

---

### Task 2: 기본 컴포넌트

**Files:**
- Create: `apps/app/src/components/ui/` 아래 `Screen.tsx`, `TopBar.tsx`, `Button.tsx`, `Card.tsx`, `HeroCard.tsx`, `StatTile.tsx`, `ListRow.tsx`, `Chips.tsx`(`StatusChip`, `TimeChip`), `TextField.tsx`, `CodeInput.tsx`, `ConsentSwitch.tsx`, `Notice.tsx`, `EmptyState.tsx`, `SegmentedControl.tsx`, `SegmentGauge.tsx`, `StepList.tsx`, `index.ts`
- Test: `apps/app/src/components/ui/ui.test.tsx`
- Modify: `apps/app/src/components/ui.tsx` → 삭제하고 `ui/index.ts`가 대신한다. 기존 import(`@/components/ui`)는 경로가 같아 그대로 동작해야 한다. 기존 `Button`(`secondary` 속성), `Input`, `ErrorText`, `styles`는 Task 5~7에서 화면을 옮기는 동안 `index.ts`에서 계속 내보낸다(`Input` → `TextField` 별칭, `secondary` → `variant="secondary"`). `styles`는 Task 7 끝에서 사용처가 없으면 지운다.

**Interfaces:**
- Consumes: Task 1의 `color`, `space`, `radius`, `type`, `tabBarSpace`, `Icon`, `Seg`
- Produces (속성은 spec "컴포넌트" 표와 같다):
  - `Screen({ scroll?, tabInset?, children, style? })`
  - `TopBar({ title, subtitle?, onBack?, right? })`
  - `Button({ label, onPress, variant = 'primary', size = 'lg', icon?, disabled?, loading?, secondary? })`
    - `variant`: `'primary' | 'secondary' | 'dark' | 'danger' | 'emergency'`
    - `secondary`는 옛 속성이다. `variant="secondary"`와 같게 처리한다.
  - `Card({ title?, action?: { label, onPress }, children })`
  - `HeroCard({ title, subtitle?, right?, children })`
  - `StatTile({ label, value, unit?, tone = 'light', valueColor? })`
  - `ListRow({ leading?, title, subtitle?, trailing?, onPress?, danger? })`
  - `StatusChip({ tone, label })`: `tone`은 `'good' | 'warn' | 'bad' | 'neutral'`
  - `TimeChip({ seconds, onPress? })`
  - `TextField({ label?, error?, ...TextInputProps })`
  - `CodeInput({ value, onChange, length = 6 })`
  - `ConsentSwitch({ value, onChange, label, disabled? })`
  - `Notice({ tone = 'info', children })`
  - `EmptyState({ icon, title, body?, children? })`
  - `SegmentedControl<T extends string>({ options: { value: T; label: string }[], value: T, onChange })`
  - `SegmentGauge({ segments: Seg[], label, value, valueSize? })`
  - `StepList({ steps: { title: string; detail?: string }[], current: number, state: 'running' | 'done' | 'failed' })`
  - `statusTone(status: string): 'good' | 'warn' | 'bad' | 'neutral'`
    - `done` → `good`
    - `queued`, `processing` → `warn`
    - `failed` → `bad`
    - 그 밖 → `neutral`

- [ ] **Step 1: 실패하는 테스트 작성** (`ui.test.tsx`)

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, SegmentGauge, SegmentedControl, TimeChip, statusTone } from './index';

test('버튼은 비활성일 때 누를 수 없고 role이 button이다', () => {
  const onPress = jest.fn();
  render(<Button label="올리고 분석 시작" onPress={onPress} disabled />);
  fireEvent.press(screen.getByRole('button', { name: '올리고 분석 시작' }));
  expect(onPress).not.toHaveBeenCalled();
});

test('옛 secondary 속성도 동작한다', () => {
  const onPress = jest.fn();
  render(<Button label="지우기" secondary onPress={onPress} />);
  fireEvent.press(screen.getByRole('button', { name: '지우기' }));
  expect(onPress).toHaveBeenCalled();
});

test('시각 칩은 "0:11 장면으로 이동"으로 읽히고 누르면 초를 넘긴다', () => {
  const onPress = jest.fn();
  render(<TimeChip seconds={11.6} onPress={onPress} />);
  fireEvent.press(screen.getByRole('button', { name: '0:11 장면으로 이동' }));
  expect(onPress).toHaveBeenCalledWith(11.6);
});

test('게이지는 라벨과 값을 읽을 수 있게 노출한다', () => {
  render(<SegmentGauge segments={['on', 'off']} label="예상 범위" value="20~40%" />);
  expect(screen.getByLabelText('예상 범위 20~40%')).toBeTruthy();
});

test('탭 전환은 선택 상태를 알린다', () => {
  const onChange = jest.fn();
  render(<SegmentedControl options={[{ value: 'a', label: '요약' }, { value: 'b', label: '근거' }]} value="a" onChange={onChange} />);
  expect(screen.getByRole('tab', { name: '요약', selected: true })).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '근거' }));
  expect(onChange).toHaveBeenCalledWith('b');
});

test('상태 색 매핑', () => {
  expect([statusTone('done'), statusTone('queued'), statusTone('failed'), statusTone('created')]).toEqual(['good', 'warn', 'bad', 'neutral']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/app && pnpm test src/components/ui/ui.test.tsx`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 컴포넌트 구현**

- **Button:** 눌림은 `Animated.spring`으로 0.97까지 줄인다. `loading`이면 `ActivityIndicator`를 보이고 누를 수 없다.
- **SegmentGauge:** 반원을 N칸으로 나눈다. 각 칸은 `react-native-svg`의 둥근 경로이고, 칸 사이 각도 간격은 시안과 같은 0.13rad다. 색은 `on` `brand`, `soft` `brand400`, `off` `gray4`다. 전체를 `accessible`로 묶어 `accessibilityLabel={`${label} ${value}`}`를 붙인다.
- **TimeChip:** `formatTime`을 쓴다. `onPress`가 없으면 버튼이 아닌 텍스트로 그린다(재생 영상이 없을 때).

- [ ] **Step 4: 통과 확인**

Run: `cd apps/app && pnpm test && pnpm exec tsc --noEmit`
Expected: 기존 42개와 새 테스트가 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/app/src/components
git commit -m "feat(app): 디자인 시스템 기본 컴포넌트"
```

---

### Task 3: 브랜드 파일과 진입 모션

**Files:**
- Create: `apps/app/scripts/brand.py` (원본 PNG → 다크 변형, 레이어, 적응형 아이콘 PNG)
- Create: `apps/app/assets/brand/source/` (원본 PNG 3개, 영문 이름 `icon.png`, `symbol.png`, `wordmark.png`)
- Create: `apps/app/assets/brand/` 생성물 `icon-dark.png`, `layer-a.png`, `layer-road.png`, `layer-star.png`, `wordtext-light.png`, `wordmark-dark.png`, `adaptive-foreground.png`, `adaptive-monochrome.png`, `splash-a.png`
- Modify: `apps/app/assets/icon.png`, `apps/app/app.json` (`icon`, `android.adaptiveIcon`, `expo-splash-screen` 또는 `splash` 설정)
- Create: `apps/app/src/components/ui/Splash.tsx`
- Modify: `apps/app/src/app/index.tsx`
- Test: `apps/app/src/components/ui/splash.test.tsx`

**Interfaces:**
- Consumes: `color.ink`, `Button`
- Produces:
  - `Splash({ onDone }: { onDone: () => void })`: 모션이 끝나면 `onDone`을 한 번 부른다.
  - `index.tsx`: 모션이 끝나고 Clerk가 로드되면 기존 분기대로 `Redirect`한다.

- [ ] **Step 1: `brand.py` 작성과 실행**

- 원본은 사용자의 `~/Downloads`에 있는 PNG 3개다: `로열 블루 A 앱 아이콘-1.png`, `파란 A와 청록 화살표 심볼-2.png`, `청록 화살표가 있는 AIGO 가로 로고-3.png`. 이 파일을 `assets/brand/source/`에 영문 이름으로 복사한다.
- 색은 기준색 근접 가중 혼합으로 바꾼다. 기준색은 파랑 `(10,50,200)`, 청록 `(20,230,190)`, 흰색 `(250,250,250)`이고 가중치는 `exp(-d/18)`이다.
- 다크 변형의 대응은 다음과 같다.
  - 아이콘: 파랑 → `#1C1C1C`, 청록 → `#3FCF8E`, 흰색 → `#FAFAFA`
  - 가로 로고: 파랑 → `#1C1C1C`
  - `wordtext-light`: 가로 로고의 글자 부분만 흰색으로 잘라 낸다(x 700 이후, 알파 128 이상 행과 열로 다시 자름).
- 레이어는 아이콘 원본에서 흰색 가중치(A), 청록 가중치(길과 별)로 나눈다. 별은 `y < 0.38H`이고 `x > 0.64W`인 영역이다. 모두 60px씩 잘라 낸다.
- 적응형 아이콘:
  - foreground: 바탕 없는 A, 길, 별을 1024 캔버스 가운데 66% 안에 넣는다.
  - monochrome: 같은 모양을 흰색 단색으로 만든다.
  - 바탕: `app.json`에서 `backgroundColor` `#1C1C1C`로 둔다.

Run: `cd apps/app && uv run --with numpy --with pillow python -I scripts/brand.py`
Expected: 위 파일이 생기고, 같은 명령을 다시 실행해도 결과가 같다.

- [ ] **Step 2: `app.json` 연결**

- `icon`: `./assets/brand/icon-dark.png`
- `android.adaptiveIcon`: `{ foregroundImage, monochromeImage, backgroundColor: '#1C1C1C' }`. 기존 `backgroundImage` 키는 지운다.
- 스플래시: 바탕 `#1C1C1C`, 이미지 `splash-a.png`
- 기존 `assets/android-icon-*.png`, `splash-icon.png`, `favicon.png`는 쓰지 않으면 지운다.

- [ ] **Step 3: 실패하는 테스트 작성** (`splash.test.tsx`)

```tsx
import { act, render, screen } from '@testing-library/react-native';
import { Splash } from './Splash';

jest.useFakeTimers();

test('1.4초 모션이 끝나면 onDone을 한 번 부른다', () => {
  const onDone = jest.fn();
  render(<Splash onDone={onDone} />);
  act(() => jest.advanceTimersByTime(1300));
  expect(onDone).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(300));
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('모션은 화면 읽기에 AIGO로 읽힌다', () => {
  render(<Splash onDone={() => {}} />);
  expect(screen.getByLabelText('AIGO')).toBeTruthy();
});
```

`index.tsx`의 "모션 중 현장 모드 버튼 노출"도 같은 파일에서 확인한다. `@clerk/expo`의 `useAuth`를 `{ isLoaded: false }`로 mock하고 `Index`를 렌더한 뒤 다음을 본다.
- 바로 `getByRole('button', { name: '사고 현장 모드' })`가 있다.
- 1.5초 뒤에도 그 버튼이 있다.

- [ ] **Step 4: 실패 확인**

Run: `cd apps/app && pnpm test src/components/ui/splash.test.tsx`
Expected: FAIL

- [ ] **Step 5: 구현**

- `Splash`:
  - 동작: `Animated.parallel`과 `Animated.delay`로 spec 타이밍을 맞춘다. 끝나면 `onDone`을 부른다.
  - 길의 드러남: 너비가 0에서 100%로 커지는 `overflow: 'hidden'` 컨테이너 안에 레이어 이미지를 고정 크기로 둔다.
  - 별: `scale` 0→1과 `rotate` -90°→0°로 움직인다.
- `index.tsx`:
  - `const [played, setPlayed] = useState(false)`를 둔다.
  - `!played || !isLoaded`면 `ink` 바탕에 `Splash`를 보인다.
  - 아래쪽에는 "사고 현장 모드" 버튼(`variant="danger"`)을 항상 둔다.
  - `played && !isLoaded`면 로고 아래에 "불러오는 중..."을 함께 보인다.
  - 그 밖에는 기존 `Redirect` 분기를 그대로 쓴다.

- [ ] **Step 6: 통과 확인**

Run: `cd apps/app && pnpm test && pnpm exec tsc --noEmit && npx expo-doctor`
Expected: PASS, 20/20

- [ ] **Step 7: 커밋**

```bash
git add apps/app/scripts/brand.py apps/app/assets apps/app/app.json apps/app/src/components/ui/Splash.tsx apps/app/src/components/ui/splash.test.tsx apps/app/src/app/index.tsx
git commit -m "feat(app): 다크 로고, 앱 아이콘, 진입 모션"
```

---

### Task 4: 하단 메뉴 5개와 라우트 이동

**Files:**
- Create: `apps/app/src/components/ui/FloatingTabBar.tsx`
- Modify: `apps/app/src/app/(tabs)/_layout.tsx`
- Move: `apps/app/src/app/upload.tsx` → `apps/app/src/app/(tabs)/upload.tsx`
- Create: `apps/app/src/components/SceneBody.tsx` (`scene/index.tsx`의 본문)
- Modify: `apps/app/src/app/scene/index.tsx` (`SceneBody`만 렌더)
- Create: `apps/app/src/app/(tabs)/emergency.tsx` (`SceneBody` + `tabInset`)
- Modify: `apps/app/src/app/_layout.tsx` (루트 Stack에서 `upload` 항목 제거)
- Create: `apps/app/src/lib/upload-state.ts`
- Test: `apps/app/src/lib/upload-state.test.ts`, `apps/app/src/components/ui/tabbar.test.tsx`

**Interfaces:**
- Consumes: `color`, `Icon`, `tabBarSpace`
- Produces:
  - `FloatingTabBar(props: BottomTabBarProps)`: `@react-navigation/bottom-tabs` 타입이다. expo-router `Tabs`가 넘긴다.
  - `TAB_ITEMS: { route: 'home' | 'analyses' | 'upload' | 'emergency' | 'account'; label: string; icon: IconName }[]`. 순서와 라벨은 Global Constraints를 따른다.
  - `SceneBody({ tabInset?: boolean })`
  - `upload-state.ts`:
    - `type UploadKey = { uri: string } | null`
    - `nextUploadState(prev: { fileUri: string | null; attemptUri: string | null }, event: 'shared' | 'picked' | 'submitted' | 'tabReturn', incomingUri?: string): { resetFile: boolean; dropAttempt: boolean }`

- [ ] **Step 1: 실패하는 테스트 작성**

`upload-state.test.ts`:

```ts
import { nextUploadState } from './upload-state';

test('탭을 오가면 아무것도 지우지 않는다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'tabReturn')).toEqual({ resetFile: false, dropAttempt: false });
});
test('제출이 끝나면 모두 지운다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'submitted')).toEqual({ resetFile: true, dropAttempt: true });
});
test('공유로 다른 영상이 오면 새로 시작한다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'shared', 'b')).toEqual({ resetFile: true, dropAttempt: true });
});
test('같은 영상이 다시 공유되면 기존 attempt를 살린다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'shared', 'a')).toEqual({ resetFile: false, dropAttempt: false });
});
```

`tabbar.test.tsx`: `FloatingTabBar`에 가짜 `state`(routes 5개, index 2)와 `navigation.navigate` mock을 넘겨 다음을 확인한다.
- 버튼 5개가 `홈`, `내 분석`, `분석하기`, `현장 모드`, `계정` 이름으로 있다.
- `분석하기`가 `selected`다.
- `계정`을 누르면 `navigate('account')`가 불린다.

- [ ] **Step 2: 실패 확인**

Run: `cd apps/app && pnpm test src/lib/upload-state.test.ts src/components/ui/tabbar.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

- **`FloatingTabBar`:**
  - 모양: 화면 아래 가운데에 떠 있는 `ink` 알약(불투명도 0.92)이다. 아이콘 칸 46, 안쪽 여백 7, `bottom`은 `safeArea.bottom + 18`이다.
  - 선택 원: `Animated.spring`으로 `translateX`를 옮긴다.
  - 아이콘 색: 선택한 탭은 `ink`, 나머지는 흰색이다. `emergency`만 선택되지 않았을 때 `sceneIcon`이다.
  - 각 버튼: `accessibilityRole="tab"`, `accessibilityState={{ selected }}`
- **`(tabs)/_layout.tsx`:** `Tabs tabBar={(p) => <FloatingTabBar {...p} />}`와 `screenOptions={{ headerShown: false }}`를 쓰고, `TAB_ITEMS` 순서로 `Tabs.Screen`을 둔다.
- **`(tabs)/upload.tsx`:** 기존 로직을 유지하고 `nextUploadState`를 이렇게 연결한다.
  - `params.uri` 변화: `'shared'`
  - 제출 성공 직후 `router.replace` 전: `'submitted'`
  - 결과에 따라 `setFile(null)`, `setTrim`, `setConsent(false)`, `setFailure(null)`, `attempt.current = null`을 적용한다.
  - 기존 `useEffect(() => () => abort.current.abort(), [])`는 탭이 남아 있어 언마운트되지 않으므로 그대로 둔다.
- **라우트 이동 확인:** `rg "'/upload'|\"/upload\"|'/scene'" apps/app/src`로 호출부를 찾는다.
  - `/upload`는 탭 경로라 그대로 둔다.
  - 로그인 상태 화면(`home`)의 현장 모드 버튼만 `/emergency`로 바꾼다.
  - 로그인 전 화면(`index`, `sign-in`, `share`)은 `/scene` 그대로 둔다.

- [ ] **Step 4: 통과 확인**

Run: `cd apps/app && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS. `native-intent.test.ts`도 그대로 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add -A apps/app/src
git commit -m "feat(app): 하단 메뉴 5개(분석하기, 현장 모드 탭)와 떠 있는 탭 바"
```

---

### Task 5: 로그인, 회원가입, 홈, 내 분석, 계정, 공유 안내

**Files:**
- Modify: `apps/app/src/app/(auth)/sign-in.tsx`, `apps/app/src/app/(auth)/sign-up.tsx`, `apps/app/src/components/SocialButtons.tsx`
- Modify: `apps/app/src/app/(tabs)/home.tsx`, `apps/app/src/app/(tabs)/analyses.tsx`, `apps/app/src/app/(tabs)/account.tsx`, `apps/app/src/app/share.tsx`
- Test: `apps/app/src/components/ui/screens.test.tsx` (홈 숫자와 최근 분석 3개)

**Interfaces:**
- Consumes: Task 2 컴포넌트, `homeCounts`, `statusTone`, `analysisTitle`, `STATUS_LABEL`, `faultRange`, `seoulDate`
- Produces:
  - `RecentAnalyses({ items })`: `home.tsx` 안 또는 `components/`에 둔다. 앞쪽 3개를 `ListRow`로 보이고 "전체 보기"로 `/analyses`에 간다.
  - `AnalysisRow({ a, onPress, onDelete? })`: 목록과 홈이 같이 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성** (`screens.test.tsx`)

`AnalysisRow`에 `done` 분석(`report.fault` 있음)을 넘겨 다음을 확인한다.
- `analysisTitle` 결과, `#12`, `내 과실 20~40%`, 상태 칩 "완료"가 보인다.
- 누르면 `onPress`가 불린다.

`RecentAnalyses`에 5개를 넘겨 행이 3개만 보이는지 확인한다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

- 로그인과 회원가입:
  - 가로 로고(`wordmark-dark.png`), `TextField`, 주 버튼, 회원가입 링크, `SocialButtons`(`variant="secondary"`, 글자만)
  - 아래쪽에 현장 모드(`variant="danger"`, `/scene`)를 둔다.
  - 인증 단계는 `CodeInput`이다.
  - 기존 Clerk 호출과 오류 처리 코드는 바꾸지 않는다.
- 홈:
  - 로고, 계정 원형 버튼(`/account`), `HeroCard`, `StatTile` 3개(dark), 버튼 2개(`/upload`, `/emergency`), `RecentAnalyses`
  - 목록은 기존 `analyses.tsx`와 같은 API 호출(`limit=100`)이다.
- 내 분석: `Card` 안에 `AnalysisRow` 목록을 둔다. 빈 상태는 `EmptyState`("아직 분석한 영상이 없어요", 영상 올리기)다. 기존 삭제 동작을 유지한다.
- 계정:
  - 이메일 카드는 `useUser().user?.primaryEmailAddress?.emailAddress`다.
  - `ListRow`는 상품 보기, 로그아웃, 탈퇴(`danger`)다. 기존 `Alert`와 캐시 정리를 유지한다.
- 공유 안내: `EmptyState`(lock 아이콘), 기존 문구와 버튼

Run: `cd apps/app && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add -A apps/app/src
git commit -m "feat(app): 로그인, 홈, 내 분석, 계정, 공유 안내 화면 디자인"
```

---

### Task 6: 분석하기, 분석 진행, 레포트

**Files:**
- Modify: `apps/app/src/app/(tabs)/upload.tsx`
- Modify: `apps/app/src/components/analysis.tsx` (`ProgressView`, `ReportView`, `FailureNotice`)
- Modify: `apps/app/src/app/analyses/[id].tsx`
- Test: `apps/app/src/lib/analysis.test.ts`에 추가하거나 `apps/app/src/components/report.test.tsx` 생성

**Interfaces:**
- Consumes: `SegmentGauge`, `faultSegments`, `stageSegments`, `StepList`, `SegmentedControl`, `TimeChip`, `StatTile`, `Notice`, `ListRow`, `VideoView`(expo-video)
- Produces:
  - `ReportTab = 'summary' | 'evidence' | 'basis'`
  - `ReportView({ analysis, onReload, tab, onTab })`: 탭 상태는 `[id].tsx`가 갖는다.

**레포트 탭 배분 (spec "데이터 매핑"을 실제 필드로 정함):**

| 탭 | 내용 |
|---|---|
| 요약 | `DISCLAIMER` `Notice(warn)`, 관여, `accident_type`, `summary` |
|  | `fault`가 있으면: `SegmentGauge`(`faultSegments(my_min, my_max)`, 라벨 "예상 범위", 값 `faultRange`), `StatTile` 3개 |
|  | `StatTile` 3개: 신뢰도 `LEVEL[confidence]`(high는 `brand600`, medium은 `warning600`, low는 `danger600`), 기준 도표 `chart_id`, 기본과실 `${base}%` |
|  | `fault`가 없으면: 기존 `fault_note` 또는 witness 문구 |
|  | 이어서 `CONFIDENCE_MEANS`, 심각도, 충돌 시각 `TimeChip`, 지금 할 일, 이후 대응 |
| 근거 | 영상, 타임라인(`EvidenceRows` → `ListRow` + `TimeChip`), 그 밖에 확인된 사실, 유리한 점, 불리한 점, 확인할 수 없는 사실 |
| 기준 | `FaultBreakdown`(기본과실, 수정요소 행, 내 과실 예상, 기준 도표 제목, 내 차 표시, 출처), 영상으로 판단하지 못한 요소, 12대 중과실, 맨 아래 분석 삭제 |

- `involvement === 'none'`이면 탭 없이 기존 구성(주의, `NO_SCENE`, 사유, 안내, 영상)을 카드로 보인다.
- 영상(`player`)은 탭을 바꿔도 같은 인스턴스를 유지한다. `ReportView` 안에서 한 번 만들고 근거 탭에서만 `VideoView`를 렌더한다.
- 요약 탭의 충돌 시각 `TimeChip`을 누르면 근거 탭으로 바꾼 뒤 그 시각으로 이동한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`ReportView`에 `fault`가 있는 `done` 분석을 넘겨 다음을 확인한다.
- 기본 탭(요약)에 `예상 범위 20~40%` 라벨과 "기준 도표", "차43-2"가 보인다.
- `근거` 탭을 누르면 `onTab('evidence')`가 불린다.
- `involvement: 'none'` 분석에서는 `tab` role이 없다.

`ProgressView`에 `stage: 'focus'`, `processing` 분석을 넘겨 `단계 4/6` 라벨이 있는지 확인한다.

`expo-video`는 `jest.mock`으로 `useVideoPlayer`가 `{ pause, currentTime }`를 돌려주게 한다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

- 분석하기:
  - `TopBar` 없이 제목(Title)을 둔다.
  - 영상을 고르기 전에는 `EmptyState`("어떤 영상을 분석할까요?", 갤러리에서 영상 고르기)를 보인다.
  - 고른 뒤에는 `VideoView`를 `radius.video` 틀에 넣고 `TrimBar`를 둔다. `TrimBar`는 전체 길이 대비 구간을 `brand` 테두리 막대로 표시하고, 길이를 모르면 숨긴다.
  - 구간 버튼 3개(`size="md" variant="secondary"`), 형식 안내, 동의 `Notice` + `ConsentSwitch`, 진행 문구, `FailureNotice`(카드), 주 버튼을 둔다.
  - `Screen tabInset`을 쓴다.
- 분석 진행: `SegmentGauge`(`stageSegments`)와 `StepList`, 기존 "연결이 불안정합니다" 문구, 안내 `Notice`
- `[id].tsx`:
  - `TopBar`: 제목은 `analysisTitle`, 부제는 관여와 날짜, `right`는 PDF 공유 원형 버튼(`done`이고 레포트가 있을 때)이다.
  - 진행, 실패, 미완료 상태는 화면 아래에 분석 삭제 버튼을 지금처럼 둔다.
  - `done`이면 삭제는 기준 탭으로 옮긴다.

Run: `cd apps/app && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add -A apps/app/src
git commit -m "feat(app): 분석하기, 진행, 레포트(요약, 근거, 기준) 화면 디자인"
```

---

### Task 7: 사고 현장 모드와 현장 사진

**Files:**
- Modify: `apps/app/src/components/SceneBody.tsx`, `apps/app/src/app/scene/photos.tsx`, `apps/app/src/app/scene/_layout.tsx`
- Modify: `apps/app/src/components/ui/index.ts` (사용처가 없어진 옛 `styles`, `Input` 제거)
- Test: `apps/app/src/components/scene.test.tsx`

**Interfaces:**
- Consumes: `Button`(`emergency`, `dark`), `Card`, `TextField`, `ListRow`, `Icon`, `TopBar`

- [ ] **Step 1: 실패하는 테스트 작성**

`SceneBody`를 렌더해 다음을 확인한다.
- 첫 두 버튼이 "112 신고 전화", "119 신고 전화"다(`getAllByRole('button')` 순서).
- 체크리스트 6개는 `checkbox` role이고, 누르면 `checked`가 바뀐다.
- `expo-location`, `expo-image-picker`, `scene-store`는 mock한다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

- 현장 모드:
  - 112, 119 `emergency` 버튼은 2열이다. 그 아래 체크리스트 카드(체크 상자 행), 현장 사진 촬영(`dark`, 아이콘 camera), 사진 보기 `ListRow`, 보험사 카드(`TextField`, 번호 저장, 보험사에 전화)가 온다.
  - `tabInset`이면 아래 여백을 둔다.
- 현장 사진:
  - `TopBar`(뒤로가기), 3열 그리드, 선택한 사진의 시각과 위치 카드, 공유(`secondary`)와 삭제(`danger`)
  - 기존 `Alert` 확인과 삭제 동작은 유지한다.
- `scene/_layout.tsx`: Stack 헤더를 숨기고 `TopBar`를 쓴다.
- `ui/index.ts`: `rg "styles\b|Input\b" apps/app/src`로 남은 사용처가 없으면 옛 내보내기를 지운다.

Run: `cd apps/app && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add -A apps/app/src
git commit -m "feat(app): 사고 현장 모드와 현장 사진 화면 디자인"
```

---

### Task 8: 기기 확인과 문서

**Files:**
- Modify: `README.md` (앱 절: 디자인 시스템 위치, `brand.py` 실행법)
- 기기 스크린샷은 저장소에 넣지 않는다. 확인 결과는 PR 본문에 글로 적는다.

**Interfaces:**
- Consumes: Task 1~7 전체

- [ ] **Step 1: 네이티브 다시 빌드**

Run: `cd apps/app && rm -rf android && npx expo run:android` (에뮬레이터 `aigo`, 로컬 API, `scratchpad/localenv.sh` 방식은 이전 작업과 같다)
Expected: 앱이 열리고 진입 모션 뒤 로그인 화면이 나온다.

- [ ] **Step 2: 화면 12종 확인**

`+clerk_test` 이메일과 코드 424242로 임시 계정을 만든다. 다음 순서로 지나며 각 화면을 시안 `design-system-v3.html`과 비교한다.
1. 진입
2. 로그인
3. 회원가입
4. 홈
5. 분석하기(구간 지정)
6. 진행
7. 레포트 세 탭
8. 내 분석
9. 계정
10. 현장 모드 탭
11. 현장 사진
12. 공유 안내(로그아웃 상태에서 Files 공유)

Expected:
- 하단 메뉴가 탭 화면 5개에만 있다.
- 레포트, 현장 사진, 로그아웃 `/scene`에는 하단 메뉴가 없다.
- 근거 시각을 누르면 영상이 그 장면으로 이동한다.
- 업로드 실패 뒤 다른 탭에 갔다 와서 다시 시도해도 새 분석이 생기지 않는다(서버 목록 수로 확인).

- [ ] **Step 3: 오프라인 릴리스 확인**

Run: `cd apps/app/android && ./gradlew assembleRelease`. 비행기 모드로 설치해 첫 실행한다.
Expected:
- 모션 중에 현장 모드 버튼이 보인다.
- 누르면 `/scene`이 열리고 112 다이얼러가 뜬다(전화는 걸지 않는다).

- [ ] **Step 4: 전체 검사**

Run: `cd apps/app && pnpm test && pnpm exec tsc --noEmit && npx expo-doctor`
Expected: 모두 통과

- [ ] **Step 5: 정리와 커밋**

- 임시 Clerk 계정은 앱의 탈퇴로 지운다.
- 에뮬레이터, Metro, 로컬 API, worker, MinIO를 끈다.

```bash
git add README.md
git commit -m "docs: 앱 디자인 시스템과 로고 생성 방법"
```
