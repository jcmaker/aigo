// analysis.ts(faultRange 등)가 api.ts를 거쳐 Clerk를 불러온다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Analysis } from '@/lib/analysis';
import { AnalysisRow, RecentAnalyses } from '../AnalysisRow';

const done = (id: number) =>
  ({ id, status: 'done', created_at: '2026-11-08T03:00:00Z', report: { accident_type: '차선 변경 사고', involvement: 'involved', fault: { my_min: 20, my_max: 40 } } }) as unknown as Analysis;

test('분석 행은 제목, 번호, 과실, 상태를 보이고 누르면 onPress를 부른다', async () => {
  const onPress = jest.fn();
  await render(<AnalysisRow a={done(12)} onPress={onPress} />);
  expect(screen.getByText('차선 변경 사고')).toBeTruthy();
  expect(screen.getByText(/#12/)).toBeTruthy();
  expect(screen.getByText(/내 과실 20~40%/)).toBeTruthy();
  expect(screen.getByText('완료')).toBeTruthy();
  await fireEvent.press(screen.getByText('차선 변경 사고'));
  expect(onPress).toHaveBeenCalled();
});

test('최근 분석은 앞의 3개만 보이고 전체 보기로 목록에 간다', async () => {
  await render(<RecentAnalyses items={[1, 2, 3, 4, 5].map(done)} />);
  expect(screen.getAllByText('차선 변경 사고')).toHaveLength(3);
  await fireEvent.press(screen.getByText('전체 보기'));
  expect(mockPush).toHaveBeenCalledWith('/analyses');
});

test('DashPi에서 온 분석 행에만 DashPi 칩이 있다', async () => {
  await render(<AnalysisRow a={{ ...done(1), source: 'dashpi' }} onPress={jest.fn()} />);
  expect(screen.getByText('DashPi')).toBeTruthy();
  await render(<AnalysisRow a={{ ...done(2), source: 'upload' }} onPress={jest.fn()} />);
  expect(screen.queryByText('DashPi')).toBeNull();
});
