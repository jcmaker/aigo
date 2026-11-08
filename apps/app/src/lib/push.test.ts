const mockGetToken = jest.fn();
const mockGetPerm = jest.fn();
const mockRequestPerm = jest.fn();
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: () => mockGetPerm(),
  requestPermissionsAsync: () => mockRequestPerm(),
  getExpoPushTokenAsync: (o: unknown) => mockGetToken(o),
}));
const mockConstants: { expoConfig: { extra?: { eas?: { projectId?: string } } } } = { expoConfig: {} };
// import가 먼저 실행되므로 값은 읽는 시점에 가져온다.
jest.mock('expo-constants', () => ({ __esModule: true, default: { get expoConfig() { return mockConstants.expoConfig; } } }));

import { analysisIdFrom, registerPush, unregisterPush } from './push';

const withProject = () => { mockConstants.expoConfig = { extra: { eas: { projectId: 'p-1' } } }; };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockConstants.expoConfig = {};
  mockGetPerm.mockResolvedValue({ granted: true });
  mockGetToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
});

test('analysisIdFrom은 숫자만 받는다', () => {
  expect(analysisIdFrom({ analysis_id: 7 })).toBe(7);
  expect(analysisIdFrom({ analysis_id: '7' })).toBe(7);
  for (const bad of [{ analysis_id: 'abc' }, { analysis_id: '../x' }, { analysis_id: 1.5 }, { analysis_id: -1 }, { analysis_id: null }, {}, null, undefined, 'x'])
    expect(analysisIdFrom(bad)).toBeNull();
});

test('EAS 프로젝트 ID가 없으면 조용히 건너뛴다', async () => {
  const api = jest.fn();
  await registerPush(api, true);
  expect(api).not.toHaveBeenCalled();
  expect(mockGetToken).not.toHaveBeenCalled();
});

test('권한이 있으면 토큰을 등록한다', async () => {
  withProject();
  const api = jest.fn().mockResolvedValue(undefined);
  await registerPush(api, false);
  expect(mockGetToken).toHaveBeenCalledWith({ projectId: 'p-1' });
  expect(api).toHaveBeenCalledWith('/api/v1/devices', expect.objectContaining({ method: 'POST' }));
});

test('권한이 없으면 ask일 때만 요청하고, 거부되면 건너뛴다', async () => {
  withProject();
  mockGetPerm.mockResolvedValue({ granted: false });
  mockRequestPerm.mockResolvedValue({ granted: false });
  const api = jest.fn();
  await registerPush(api, false);
  expect(mockRequestPerm).not.toHaveBeenCalled();
  await registerPush(api, true);
  expect(mockRequestPerm).toHaveBeenCalledTimes(1);
  expect(api).not.toHaveBeenCalled();
});

test('토큰을 못 받아도(에뮬레이터) 예외가 나가지 않는다', async () => {
  withProject();
  mockGetToken.mockRejectedValue(new Error('FCM 없음'));
  const api = jest.fn();
  await expect(registerPush(api, true)).resolves.toBeUndefined();
  await expect(unregisterPush(api)).resolves.toBeUndefined();
  expect(api).not.toHaveBeenCalled();
});

test('토큰 삭제가 실패해도 unregisterPush는 끝난다', async () => {
  withProject();
  const api = jest.fn().mockRejectedValue(new Error('offline'));
  await expect(unregisterPush(api)).resolves.toBeUndefined();
  expect(api).toHaveBeenCalledWith('/api/v1/devices?token=ExponentPushToken%5Babc%5D', { method: 'DELETE' });
});
