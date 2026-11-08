// ui 묶음이 analysis.ts를 거쳐 Clerk를 불러오고, Clerk는 타이머를 남긴다.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default); // Screen이 안전 영역을 읽는다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SceneBody } from './SceneBody';

jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 3 } }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }));
jest.mock('@/lib/scene-store', () => ({
  addScenePhoto: jest.fn(),
  getInsurerPhone: jest.fn().mockResolvedValue(null),
  setInsurerPhone: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

test('첫 두 버튼은 112, 119 신고 전화다', async () => {
  await render(<SceneBody />);
  const buttons = screen.getAllByRole('button');
  expect(buttons[0]).toHaveAccessibleName('112 신고 전화');
  expect(buttons[1]).toHaveAccessibleName('119 신고 전화');
});

test('체크리스트 6개는 누르면 checked가 바뀐다', async () => {
  await render(<SceneBody />);
  const boxes = screen.getAllByRole('checkbox');
  expect(boxes).toHaveLength(6);
  expect(screen.queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
  await fireEvent.press(boxes[0]);
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1);
});
