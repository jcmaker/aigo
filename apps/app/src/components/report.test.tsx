// analysis.ts가 api.ts를 거쳐 Clerk를 불러오고, Clerk는 타이머를 남긴다.
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
const mockPlayer = { pause: jest.fn(), currentTime: 0, loop: true, status: 'idle' };
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { useVideoPlayer: () => mockPlayer, VideoView: View };
});
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: (_p: unknown, _e: string, init: unknown) => init }));

import * as WebBrowser from 'expo-web-browser';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Analysis, Report } from '@/lib/analysis';
import { ProgressView, ReportView } from './analysis';

const report: Report = {
  involvement: 'party',
  reason: null,
  accident_type: '진로변경 중 충돌',
  summary: '상대 차가 차로를 바꾸다 부딪혔습니다.',
  collision_t: 11.2,
  confidence: 'medium',
  severity: 'low',
  timeline: [{ t: 9, text: '상대 차가 왼쪽에서 차로를 바꿈' }],
  facts: [],
  unseen: ['신호 상태'],
  fault: { chart_id: '차43-2', chart_title: '진로변경 사고', source_url: 'https://example.com', me: 'A', base: 30, my_min: 20, my_max: 40, steps: [], unknown: [], laws: [], cases: [] },
  fault_note: null,
  serious_violations: [],
  favorable: [],
  unfavorable: [],
  actions_now: [],
  actions_later: [],
};

const analysis = (r: Partial<Analysis>): Analysis => ({
  id: 12,
  source: 'upload',
  status: 'done',
  stage: null,
  progress: [],
  report,
  playback_url: 'https://example.com/v.mp4',
  overlay_url: null,
  error: null,
  created_at: '2026-11-08T00:00:00Z',
  ...r,
});

test('요약 탭에 예상 범위 게이지와 기준 도표가 보이고, 근거 탭을 누르면 onTab이 불린다', async () => {
  const onTab = jest.fn();
  await render(<ReportView analysis={analysis({})} onReload={() => {}} tab="summary" onTab={onTab} />);
  expect(screen.getByLabelText('예상 범위 20~40%')).toBeTruthy();
  expect(screen.getByLabelText('기준 도표 차43-2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: '근거' }));
  expect(onTab).toHaveBeenCalledWith('evidence');
});

test('요약 탭의 충돌 시각을 누르면 근거 탭으로 바꾼다', async () => {
  const onTab = jest.fn();
  await render(<ReportView analysis={analysis({})} onReload={() => {}} tab="summary" onTab={onTab} />);
  await fireEvent.press(screen.getByRole('button', { name: '0:11 장면으로 이동' }));
  expect(onTab).toHaveBeenCalledWith('evidence');
});

test('사고 장면이 없으면 탭이 없다', async () => {
  const none = { ...report, involvement: 'none' as const, fault: null, reason: '충돌이 보이지 않습니다' };
  await render(<ReportView analysis={analysis({ report: none })} onReload={() => {}} tab="summary" onTab={() => {}} />);
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByText('충돌이 보이지 않습니다')).toBeTruthy();
});

test('진행 화면은 단계 4/6을 보인다', async () => {
  await render(<ProgressView analysis={analysis({ status: 'processing', stage: 'focus', report: null })} stale={false} />);
  expect(screen.getByLabelText(/단계 4\/6/)).toBeTruthy();
});

test('주의 문구는 "주의"로 읽힌다', async () => {
  await render(<ReportView analysis={analysis({})} onReload={() => {}} tab="summary" onTab={() => {}} />);
  expect(screen.getByLabelText('주의 영상 기반 AI 추정이며 법적 판단이 아닙니다')).toBeTruthy();
});

test('근거 탭을 떠나면 영상을 멈춘다', async () => {
  const props = { analysis: analysis({}), onReload: () => {}, onTab: () => {} };
  const { rerender } = await render(<ReportView {...props} tab="evidence" />);
  mockPlayer.pause.mockClear();
  await rerender(<ReportView {...props} tab="summary" />);
  expect(mockPlayer.pause).toHaveBeenCalled();
});

const withLaws = (laws: Report['fault'] extends infer F ? (F extends { laws: infer L } ? L : never) : never, cases: any[] = []) =>
  analysis({ report: { ...report, fault: { ...report.fault!, laws, cases } } });

test('기준 탭에 관련 법규와 참고 판례가 보이고 누르면 url을 연다', async () => {
  const law = { name: '도로교통법', article: '제19조', title: '안전거리 확보 등', url: 'https://law.example/19' };
  const c = { court: '대법원', date: '1986.12.9.', number: '86다카1551', url: 'https://www.law.go.kr/판례/(86다카1551)' };
  await render(<ReportView analysis={withLaws([law], [c])} onReload={() => {}} tab="basis" onTab={() => {}} />);
  expect(screen.getByText('관련 법규')).toBeTruthy();
  expect(screen.getByText('참고 판례')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: '도로교통법 제19조(안전거리 확보 등)' }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(law.url);
  await fireEvent.press(screen.getByRole('button', { name: '대법원 1986.12.9. 86다카1551' }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(c.url);
});

test('법제처 판례가 아닌 판례 url은 글로 두고 출처 한 줄만 연다', async () => {
  (WebBrowser.openBrowserAsync as jest.Mock).mockClear();
  const src = 'https://accident.knia.or.kr/myaccident-content?chartNo=1';
  const cases = [
    { court: '서울중앙지방법원', date: '2015.1.1.', number: '2014가단1', url: src },
    { court: '수원지방법원', date: '2016.1.1.', number: '2015나2', url: src },
  ];
  await render(<ReportView analysis={withLaws([], cases)} onReload={() => {}} tab="basis" onTab={() => {}} />);
  expect(screen.getByText('서울중앙지방법원 2015.1.1. 2014가단1')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '서울중앙지방법원 2015.1.1. 2014가단1' })).toBeNull();
  expect(screen.getAllByRole('button', { name: '출처: 과실비율정보포털' }).length).toBe(1);
  await fireEvent.press(screen.getByRole('button', { name: '출처: 과실비율정보포털' }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(src);
});

test('법규와 판례가 없거나 옛 레포트에 필드가 없으면 제목을 숨긴다', async () => {
  const old = analysis({ report: { ...report, fault: { ...report.fault!, laws: undefined, cases: undefined } as any } });
  await render(<ReportView analysis={old} onReload={() => {}} tab="basis" onTab={() => {}} />);
  expect(screen.queryByText('관련 법규')).toBeNull();
  expect(screen.queryByText('참고 판례')).toBeNull();
});

test('http(s)가 아닌 url은 누를 수 없고 열지 않는다', async () => {
  (WebBrowser.openBrowserAsync as jest.Mock).mockClear();
  const law = { name: '도로교통법', article: '제19조', title: '안전거리 확보 등', url: 'javascript:alert(1)' };
  await render(<ReportView analysis={withLaws([law])} onReload={() => {}} tab="basis" onTab={() => {}} />);
  expect(screen.getByText('도로교통법 제19조(안전거리 확보 등)')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '도로교통법 제19조(안전거리 확보 등)' })).toBeNull();
  expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
});
