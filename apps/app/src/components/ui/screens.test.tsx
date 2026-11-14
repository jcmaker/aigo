// analysis.ts(faultRange 등)가 api.ts를 거쳐 Clerk를 불러온다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Analysis } from '@/lib/analysis';
import { AnalysisRow, RecentAnalyses } from '../AnalysisRow';

const done = (id: number) =>
  ({ id, status: 'done', created_at: '2026-11-08T03:00:00Z', report: { accident_type: '차선 변경 사고', involvement: 'involved', fault: { my_min: 20, my_max: 40 } } }) as unknown as Analysis;

test('분석 행은 제목, 상태, 내 과실 범위를 크게 보이고 누르면 onPress, 길게 누르면 onDelete를 부른다', async () => {
  const onPress = jest.fn();
  const onDelete = jest.fn();
  await render(<AnalysisRow a={done(12)} onPress={onPress} onDelete={onDelete} />);
  expect(screen.getByText('차선 변경 사고')).toBeTruthy();
  expect(screen.getByText('완료')).toBeTruthy();
  expect(screen.getByText('내 과실')).toBeTruthy();
  expect(screen.getByText('20~40%')).toBeTruthy();
  expect(screen.queryByText(/#12/)).toBeNull(); // 사용자에게 의미 없는 번호는 보이지 않는다
  const row = screen.getByRole('button', { name: /차선 변경 사고, 완료, 내 과실 20~40%/ });
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalled();
  await fireEvent(row, 'longPress');
  expect(onDelete).toHaveBeenCalled();
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
