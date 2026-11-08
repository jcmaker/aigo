import { faultSegments, matches, stageSegments } from './ui-logic';

test('과실 범위는 겹치는 칸만 켠다', () => {
  expect(faultSegments(20, 40)).toEqual(['off','off','on','on','off','off','off','off','off','off']);
  expect(faultSegments(25, 35)).toEqual(['off','off','on','on','off','off','off','off','off','off']);
  expect(faultSegments(0, 0)).toEqual(['on', ...Array(9).fill('off')]);
  expect(faultSegments(100, 100)).toEqual([...Array(9).fill('off'), 'on']);
  expect(faultSegments(50, 50)[5]).toBe('on');
  expect(faultSegments(0, 100)).toEqual(Array(10).fill('on'));
});

test('진행 단계는 끝난 칸 on, 현재 칸 soft, 실패면 soft 없음', () => {
  expect(stageSegments(3, 6, 'running')).toEqual(['on','on','on','soft','off','off']);
  expect(stageSegments(-1, 6, 'running')).toEqual(Array(6).fill('off')); // 대기열
  expect(stageSegments(3, 6, 'failed')).toEqual(['on','on','on','off','off','off']);
  expect(stageSegments(5, 6, 'done')).toEqual(Array(6).fill('on'));
});

test('목록 필터: 완료는 done만, 진행 중은 created·queued·processing, 실패는 전체에만', () => {
  const all = ['created', 'queued', 'processing', 'done', 'failed'];
  expect(all.filter((s) => matches('all', s))).toEqual(all);
  expect(all.filter((s) => matches('done', s))).toEqual(['done']);
  expect(all.filter((s) => matches('running', s))).toEqual(['created', 'queued', 'processing']);
});
