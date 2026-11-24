// analysis.ts(faultRange 등)가 api.ts를 거쳐 Clerk를 불러온다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Analysis } from '@/lib/analysis';
import { AnalysisRow, RecentStrip } from '../AnalysisRow';

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

test('홈 최근 분석 띠는 한 줄로 제목과 과실 범위를 보이고 누르면 그 리포트로 간다', async () => {
  await render(<RecentStrip a={done(7)} />);
  expect(screen.getByText('차선 변경 사고')).toBeTruthy();
  expect(screen.getByText('20~40%')).toBeTruthy();
  expect(screen.queryByText('전체 보기')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /최근 분석, 차선 변경 사고, 완료, 내 과실 20~40%/ }));
  expect(mockPush).toHaveBeenCalledWith('/analyses/7');
});

test('분석 중인 최근 분석 띠는 과실 대신 분석 중 표시를 보인다', async () => {
  await render(<RecentStrip a={{ ...done(8), status: 'processing', report: null } as unknown as Analysis} />);
  expect(screen.getByText('영상을 분석하고 있어요')).toBeTruthy();
  expect(screen.getByText('분석 중')).toBeTruthy();
});

test('DashPi에서 온 분석 행에만 DashPi 칩이 있다', async () => {
  await render(<AnalysisRow a={{ ...done(1), source: 'dashpi' }} onPress={jest.fn()} />);
  expect(screen.getByText('DashPi')).toBeTruthy();
  await render(<AnalysisRow a={{ ...done(2), source: 'upload' }} onPress={jest.fn()} />);
  expect(screen.queryByText('DashPi')).toBeNull();
});

test('고르는 중인 분석 행은 체크 상태를 알리고, 누르면 onPress만 부르며 길게 눌러도 지우지 않는다', async () => {
  const onPress = jest.fn();
  const onDelete = jest.fn();
  await render(<AnalysisRow a={done(3)} onPress={onPress} onDelete={onDelete} select={{ checked: true, disabled: false }} />);
  const row = screen.getByRole('button', { name: /차선 변경 사고/ });
  expect(row.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalled();
  await fireEvent(row, 'longPress');
  expect(onDelete).not.toHaveBeenCalled();
});

test('분석 중인 행은 고를 수 없다고 알린다', async () => {
  const running = { ...done(4), status: 'processing', report: null } as unknown as Analysis;
  await render(<AnalysisRow a={running} onPress={jest.fn()} select={{ checked: false, disabled: true }} />);
  const row = screen.getByRole('button', { name: /영상을 분석하고 있어요/ });
  expect(row.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
  expect(row.props.accessibilityHint).toBe('분석 중이라 고를 수 없어요');
});
