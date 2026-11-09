// api.ts가 불러오는 Clerk는 타이머를 남긴다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));

import type { Analysis } from './analysis';
import { isToday, timeAgo, toNotices } from './notices';

const base = { progress: [], playback_url: null, overlay_url: null, error: null, stage: null, report: null } as const;
const fault = { chart_id: 'x', chart_title: 'x', source_url: '', me: 'A', base: 30, my_min: 10, my_max: 30, steps: [], unknown: [] };
const report = { involvement: 'party', accident_type: '진로변경 중 충돌', fault } as unknown as Analysis['report'];

test('완료와 실패만 최신순 알림이 된다', () => {
  const items = [
    { ...base, id: 1, status: 'done', report, created_at: '2026-11-07T00:00:00Z' },
    { ...base, id: 2, status: 'processing', created_at: '2026-11-08T00:00:00Z' },
    { ...base, id: 3, status: 'failed', error: { code: 'INVALID_VIDEO', message: '' }, created_at: '2026-11-08T01:00:00Z' },
  ] as unknown as Analysis[];
  const n = toNotices(items);
  expect(n.map((x) => x.id)).toEqual(['3:failed', '1:done']);
  expect(n[0]).toMatchObject({ title: '분석하지 못했어요', body: '영상을 읽지 못했습니다' });
  expect(n[1].body).toBe('진로변경 중 충돌 · 내 과실 10~30%');
});

test('시간 표시', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  expect(timeAgo('2026-11-09T11:59:40Z', now)).toBe('방금 전');
  expect(timeAgo('2026-11-09T11:30:00Z', now)).toBe('30분 전');
  expect(timeAgo('2026-11-09T09:00:00Z', now)).toBe('3시간 전');
  expect(timeAgo('2026-11-08T10:00:00Z', now)).toBe('어제');
  expect(timeAgo('2026-11-05T12:00:00Z', now)).toBe('4일 전');
  expect(isToday('2026-11-09T01:00:00Z', now)).toBe(true);
  expect(isToday('2026-11-08T10:00:00Z', now)).toBe(false);
});
