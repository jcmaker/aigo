import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default); // 시작 화면이 안전 영역을 읽는다.
const mockUseAuth = jest.fn();
const mockPush = jest.fn();
jest.mock('@clerk/expo', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Redirect: ({ href }: { href: string }) => require('react').createElement(require('react-native').Text, null, `redirect:${href}`),
}));
jest.mock('expo-sharing', () => ({ getSharedPayloads: () => [] }));

import Index from '@/app/index';
import { Splash } from './Splash';

beforeEach(() => {
  jest.useFakeTimers();
  mockUseAuth.mockReset();
  mockPush.mockReset();
});
afterEach(() => jest.useRealTimers());

test('1.4초 모션과 0.8초 멈춤이 끝나면(2.2초) onDone을 한 번 부른다', async () => {
  const onDone = jest.fn();
  await render(<Splash onDone={onDone} />);
  await act(async () => { jest.advanceTimersByTime(2100); });
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('부모가 새 onDone을 넘겨 다시 그려도 모션은 2.2초에 한 번만 끝난다', async () => {
  const first = jest.fn();
  const second = jest.fn();
  const view = await render(<Splash onDone={first} />);
  await act(async () => { jest.advanceTimersByTime(1800); });
  await view.rerender(<Splash onDone={second} />);
  await act(async () => { jest.advanceTimersByTime(399); });
  expect(second).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test('모션은 화면 읽기에 AIGO로 읽힌다', async () => {
  await render(<Splash onDone={() => {}} />);
  expect(screen.getByLabelText('AIGO')).toBeTruthy();
});

// index의 splashPlayed는 모듈 상태라 이 파일 안에서 이어진다. 아래 세 테스트는 순서대로 돈다.
test('처음 마운트: Clerk가 로드되면 현장 모드 버튼 없이 모션이 끝난 뒤 기존 분기대로 이동한다', async () => {
  mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
  await render(<Index />);
  expect(screen.queryByRole('button', { name: '사고 현장 모드' })).toBeNull();
  expect(screen.queryByText('redirect:/sign-in')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(2300); });
  expect(screen.getByText('redirect:/sign-in')).toBeTruthy();
});

test('index가 다시 마운트되면 모션을 건너뛰고 바로 이동한다', async () => {
  mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
  await render(<Index />);
  expect(screen.getByText('redirect:/sign-in')).toBeTruthy();
});

test('Clerk가 로드되지 않으면 로딩 막대와 문구가 보이고, 3초가 지나서야 지연 안내와 현장 모드 버튼이 보이며 버튼은 /scene으로 간다', async () => {
  mockUseAuth.mockReturnValue({ isLoaded: false });
  await render(<Index />);
  expect(screen.getByText('불러오는 중...')).toBeTruthy();
  expect(screen.getByLabelText('불러오는 중')).toBeTruthy(); // 민트 로딩 막대
  expect(screen.queryByRole('button', { name: '사고 현장 모드' })).toBeNull();
  expect(screen.queryByText('연결이 늦어지고 있어요')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(2900); });
  expect(screen.queryByRole('button', { name: '사고 현장 모드' })).toBeNull();
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(screen.getByText('연결이 늦어지고 있어요')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '사고 현장 모드' }));
  expect(mockPush).toHaveBeenCalledWith('/scene');
});
