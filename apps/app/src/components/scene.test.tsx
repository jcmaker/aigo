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
  getContacts: jest.fn().mockResolvedValue([]),
  addContact: jest.fn(),
  removeContact: jest.fn(),
  MAX_CONTACTS: 5,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

test('오른쪽 위 신고 버튼을 누르면 112, 119를 고를 수 있다', async () => {
  await render(<SceneBody />);
  expect(screen.queryByRole('button', { name: '112 경찰' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '신고' }));
  expect(screen.getByRole('button', { name: '112 경찰' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '119 구급·소방' })).toBeTruthy();
});

test('상황 안내: 질문 카드에 차례로 답하면 지금 할 일이 나오고, 아이콘을 누르면 완료된다', async () => {
  await render(<SceneBody />);
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  for (const label of ['시작하기', '다른 차', '나는 멈춰 있는데 상대가 와서 부딪혔어요', '아니요', '아니요, 다친 사람은 없어요', '일반 도로', '현장에 함께 있어요', '네, 움직일 수 있어요']) {
    await fireEvent.press(screen.getByRole('button', { name: label }));
  }
  const boxes = screen.getAllByRole('checkbox');
  expect(boxes.length).toBeGreaterThan(3);
  await fireEvent.press(boxes[0]);
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1);
  expect(screen.getByText('사고 뒤 할 일')).toBeTruthy();
});

test('상황 안내: 연기·불을 고르면 바로 대피 안내가 나온다', async () => {
  await render(<SceneBody />);
  for (const label of ['시작하기', '고정물', '네, 연기나 불이 있어요']) {
    await fireEvent.press(screen.getByRole('button', { name: label }));
  }
  expect(screen.getByText('차에서 멀리 떨어지기')).toBeTruthy();
});

test('상황 안내: 기타를 고르면 입력칸이 열리고, 적은 말이 요약에 나온다', async () => {
  await render(<SceneBody />);
  await fireEvent.press(screen.getByRole('button', { name: '시작하기' }));
  await fireEvent.press(screen.getByRole('button', { name: '기타' }));
  expect(screen.getByText('단어로 입력해 주세요')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('기타 내용'), '보행자');
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  for (const label of ['아니요', '아니요, 다친 사람은 없어요', '일반 도로', '현장에 함께 있어요', '네, 움직일 수 있어요']) {
    await fireEvent.press(screen.getByRole('button', { name: label }));
  }
  expect(screen.getByText('보행자')).toBeTruthy();
});

test('알릴 사람: 저장된 연락처마다 문자와 전화 버튼이 있고, 추가 버튼으로 입력칸이 열린다', async () => {
  const store = jest.requireMock('@/lib/scene-store');
  store.getContacts.mockResolvedValueOnce([{ id: '1', name: '엄마', relation: '가족', phone: '010-1234-5678' }]);
  await render(<SceneBody />);
  expect(await screen.findByRole('button', { name: '엄마에게 전화' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '엄마에게 문자' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '연락처 추가' }));
  expect(screen.getByLabelText('전화번호')).toBeTruthy();
});
