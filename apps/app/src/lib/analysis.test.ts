// api.ts가 불러오는 Clerk는 네이티브 런타임이 필요하고 타이머를 남긴다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));

import { renderHook, act } from '@testing-library/react-native';
import { ApiFailure } from './api';

// useFocusEffect는 포커스된 화면에서 effect처럼 돈다.
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
const mockApi = jest.fn();
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  useApi: () => mockApi,
}));

import { useAnalysis } from './analysis';

const flush = async (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));
const status = (s: string) => ({ id: 1, status: s });

beforeEach(() => {
  jest.useFakeTimers();
  mockApi.mockReset();
});
afterEach(() => jest.useRealTimers());

test('3초마다 묻다가 done이면 멈춘다', async () => {
  mockApi.mockResolvedValueOnce(status('processing')).mockResolvedValueOnce(status('processing')).mockResolvedValue(status('done'));
  const { result } = await renderHook(() => useAnalysis('1'));
  await flush(0);
  expect(mockApi).toHaveBeenCalledTimes(1);
  await flush(3000);
  await flush(3000);
  expect(mockApi).toHaveBeenCalledTimes(3);
  expect(result.current.analysis?.status).toBe('done');
  await flush(30000);
  expect(mockApi).toHaveBeenCalledTimes(3);
});

test('404면 다시 묻지 않고 notFound를 알린다', async () => {
  mockApi.mockRejectedValue(new ApiFailure(404, 'ANALYSIS_NOT_FOUND', '없습니다.'));
  const { result } = await renderHook(() => useAnalysis('1'));
  await flush(0);
  await flush(30000);
  expect(mockApi).toHaveBeenCalledTimes(1);
  expect(result.current.notFound).toBe('없습니다.');
});

test('네트워크 오류는 stale로 표시하고 계속 묻는다', async () => {
  mockApi.mockRejectedValue(new ApiFailure(0, 'NETWORK_ERROR', 'x'));
  const { result } = await renderHook(() => useAnalysis('1'));
  await flush(0);
  await flush(6000);
  expect(mockApi).toHaveBeenCalledTimes(3);
  expect(result.current.stale).toBe(true);
});

test('언마운트하면 멈춘다', async () => {
  mockApi.mockResolvedValue(status('processing'));
  const { unmount } = await renderHook(() => useAnalysis('1'));
  await flush(0);
  await unmount();
  await flush(30000);
  expect(mockApi).toHaveBeenCalledTimes(1);
});

test('리렌더링해도 호출이 늘지 않는다', async () => {
  mockApi.mockResolvedValue(status('processing'));
  const { rerender } = await renderHook(() => useAnalysis('1'));
  await flush(0);
  for (let i = 0; i < 20; i++) await rerender({});
  await flush(0);
  expect(mockApi).toHaveBeenCalledTimes(1);
});
