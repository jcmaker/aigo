import { deletable, faultSegments, homeRecent, matches } from './ui-logic';

test('과실 범위는 겹치는 칸만 켠다', () => {
  expect(faultSegments(20, 40)).toEqual(['off','off','on','on','off','off','off','off','off','off']);
  expect(faultSegments(25, 35)).toEqual(['off','off','on','on','off','off','off','off','off','off']);
  expect(faultSegments(0, 0)).toEqual(['on', ...Array(9).fill('off')]);
  expect(faultSegments(100, 100)).toEqual([...Array(9).fill('off'), 'on']);
  expect(faultSegments(50, 50)[5]).toBe('on');
  expect(faultSegments(0, 100)).toEqual(Array(10).fill('on'));
});

test('목록 필터: 완료는 done만, 진행 중은 created·queued·processing, 실패는 전체에만', () => {
  const all = ['created', 'queued', 'processing', 'done', 'failed'];
  expect(all.filter((s) => matches('all', s))).toEqual(all);
  expect(all.filter((s) => matches('done', s))).toEqual(['done']);
  expect(all.filter((s) => matches('running', s))).toEqual(['created', 'queued', 'processing']);
});

test('홈 최근 분석: 가장 최근 1건을 올린 지 14일 안일 때만 보인다', () => {
  const now = Date.parse('2026-11-22T00:00:00Z');
  const a = (created_at: string) => ({ id: 1, created_at });
  expect(homeRecent([], now)).toBeNull();
  expect(homeRecent([a('2026-11-21T00:00:00Z'), a('2026-11-01T00:00:00Z')], now)?.created_at).toBe('2026-11-21T00:00:00Z');
  expect(homeRecent([a('2026-11-08T00:00:00Z')], now)).not.toBeNull(); // 딱 14일
  expect(homeRecent([a('2026-11-07T23:59:00Z')], now)).toBeNull(); // 14일 넘음
  expect(homeRecent([a('잘못된 날짜')], now)).toBeNull();
});

test('여러 개 지우기: 대기·분석 중인 분석은 고를 수 없다', () => {
  expect(['created', 'queued', 'processing', 'done', 'failed'].filter(deletable)).toEqual(['created', 'done', 'failed']);
});
