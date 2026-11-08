import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

test('1.4초 모션이 끝나면 onDone을 한 번 부른다', async () => {
  const onDone = jest.fn();
  await render(<Splash onDone={onDone} />);
  await act(async () => { jest.advanceTimersByTime(1300); });
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('부모가 새 onDone을 넘겨 다시 그려도 모션은 1.4초에 한 번만 끝난다', async () => {
  const first = jest.fn();
  const second = jest.fn();
  const view = await render(<Splash onDone={first} />);
  await act(async () => { jest.advanceTimersByTime(1000); });
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
test('처음 마운트: 모션 중에도 현장 모드 버튼이 있고, 모션이 끝나고 Clerk가 로드되면 기존 분기대로 이동한다', async () => {
  mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
  await render(<Index />);
  expect(screen.getByRole('button', { name: '사고 현장 모드' })).toBeTruthy();
  expect(screen.queryByText('redirect:/sign-in')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(screen.getByText('redirect:/sign-in')).toBeTruthy();
});

test('index가 다시 마운트되면 모션을 건너뛰고 바로 이동한다', async () => {
  mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
  await render(<Index />);
  expect(screen.getByText('redirect:/sign-in')).toBeTruthy();
});

test('Clerk가 로드되지 않으면 현장 모드 버튼과 불러오는 중이 보이고 버튼은 /scene으로 간다', async () => {
  mockUseAuth.mockReturnValue({ isLoaded: false });
  await render(<Index />);
  expect(screen.getByText('불러오는 중...')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '사고 현장 모드' }));
  expect(mockPush).toHaveBeenCalledWith('/scene');
});
