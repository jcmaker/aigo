import { faultSegments, matches } from './ui-logic';

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
