// 업로드 탭 화면을 그대로 그려 제출 뒤 이동 방식을 확인한다. 네이티브 모듈과 서버는 가짜로 둔다.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default); // Screen이 안전 영역을 읽는다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ uri: 'file:///cache/v.mp4', name: 'v.mp4', size: '1000' }),
}));
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { useVideoPlayer: () => ({ currentTime: 0 }), VideoView: View };
});
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
const mockApi = jest.fn((path: string) => Promise.resolve(path === '/api/v1/analyses' ? { id: 7, upload_url: 'https://x', expires_at: '2099-01-01T00:00:00Z' } : {}));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), useApi: () => mockApi }));
jest.mock('@/lib/push', () => ({ registerPush: jest.fn() }));
jest.mock('@/lib/cache', () => ({ deleteCached: jest.fn() }));
jest.mock('@/lib/upload', () => ({ ...jest.requireActual('@/lib/upload'), uploadVideo: jest.fn(() => Promise.resolve()) }));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import UploadScreen from '@/app/(tabs)/upload';

test('제출이 끝나면 레포트를 탭 묶음 위에 push한다(replace하면 뒤로가기에 앱이 닫힌다)', async () => {
  await render(<UploadScreen />);
  await fireEvent.press(screen.getByRole('switch'));
  await fireEvent.press(screen.getByRole('button', { name: '올리고 분석 시작' }));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/analyses/7'));
  expect(mockApi).toHaveBeenCalledWith('/api/v1/analyses/7/submit', { method: 'POST' });
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
