// analysis.ts가 api.ts를 거쳐 Clerk를 불러오고, Clerk는 네이티브 런타임이 필요하다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));

import { STAGES } from './analysis';
import { hintAt, liveProgress } from './progress';

const now = Date.parse('2026-11-21T06:00:30Z');
const entry = (stage: string, status: string, at: string) => ({ stage, status, detail: null, at });

test('대기열은 시간을 세지 않는다', () => {
  expect(liveProgress({ status: 'queued', stage: null, progress: [] }, now)).toEqual({
    current: -1, finished: false, elapsedSec: null, stageSec: null, ratio: 0,
  });
});

test('진행 중 단계는 시작 시각부터 초를 센다', () => {
  const live = liveProgress({
    status: 'processing', stage: 'scan',
    progress: [entry('normalize', 'done', '2026-11-21T06:00:05Z'), entry('scan', 'running', '2026-11-21T06:00:10Z')],
  }, now);
  expect(live).toMatchObject({ current: 1, finished: false, elapsedSec: 25, stageSec: 20 });
  expect(live.ratio).toBeCloseTo((1 + 0.9) / 6);
});

test('현재 단계 기록이 아직 없으면 단계 초를 숨기고 막대는 끝난 단계까지만', () => {
  const live = liveProgress({
    status: 'processing', stage: 'locate',
    progress: [entry('normalize', 'done', '2026-11-21T06:00:05Z'), entry('scan', 'done', '2026-11-21T06:00:20Z')],
  }, now);
  expect(live).toMatchObject({ current: 2, stageSec: null });
  expect(live.ratio).toBeCloseTo(2 / 6);
});

test('시계 차이로 미래 시각이 와도 0초로 본다', () => {
  const live = liveProgress({
    status: 'processing', stage: 'normalize',
    progress: [entry('normalize', 'running', '2026-11-21T06:00:40Z')],
  }, now);
  expect(live.stageSec).toBe(0);
  expect(live.elapsedSec).toBe(0);
});

test('오래 걸려도 막대는 다음 단계 칸을 넘지 않는다', () => {
  const progress = ['normalize', 'scan', 'locate', 'focus'].map((s) => entry(s, 'done', '2026-11-21T05:55:00Z'));
  const live = liveProgress({
    status: 'processing', stage: 'observe',
    progress: [...progress, entry('observe', 'running', '2026-11-21T05:55:30Z')],
  }, now);
  expect(live.ratio).toBeLessThan(5 / 6);
});

test('완료면 막대가 가득 찬다', () => {
  expect(liveProgress({ status: 'done', stage: 'assess', progress: [] }, now)).toMatchObject({ finished: true, ratio: 1 });
});

test('안내 문구는 2.6초마다 바뀌고 한 바퀴 돌면 처음으로', () => {
  const n = STAGES[4].hints.length;
  expect(hintAt(4, 0)).not.toBe(hintAt(4, 2.6));
  expect(hintAt(4, 2.6 * n)).toBe(hintAt(4, 0));
});

test('안내 문구에는 숫자가 없고 단계마다 2~4개', () => {
  for (const s of STAGES) {
    expect(s.hints.length).toBeGreaterThanOrEqual(2);
    expect(s.hints.length).toBeLessThanOrEqual(4);
    for (const h of s.hints) expect(h).not.toMatch(/[0-9]/);
  }
});
