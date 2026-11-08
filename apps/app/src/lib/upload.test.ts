// api.ts가 불러오는 Clerk는 네이티브 런타임이 필요하고 타이머를 남긴다.
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));

const mockUpload = jest.fn();
const mockCreateTask = jest.fn(() => ({ uploadAsync: mockUpload }));
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({ createUploadTask: mockCreateTask, size: 5 })),
  UploadType: { BINARY_CONTENT: 0 },
}));

import { checkTrim, checkVideo, isTicketExpired, MAX_BYTES, uploadVideo, videoName, type UploadTicket } from './upload';

const ticket: UploadTicket = {
  id: 7,
  upload_url: 'https://storage.example/put',
  upload_headers: { 'Content-Type': 'video/mp4' },
  expires_at: '2026-11-07T00:15:00Z',
};

beforeEach(() => {
  jest.useFakeTimers();
  mockUpload.mockReset();
  mockCreateTask.mockClear();
});
afterEach(() => jest.useRealTimers());

test('retries_same_ticket_on_network_failure', async () => {
  mockUpload.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ status: 200 });
  const done = uploadVideo(ticket, 'file:///a.mp4', jest.fn());
  await jest.runAllTimersAsync();
  await expect(done).resolves.toBeUndefined();
  expect(mockCreateTask).toHaveBeenCalledTimes(2);
  for (const [url, opts] of mockCreateTask.mock.calls as unknown as [string, any][]) {
    expect(url).toBe(ticket.upload_url);
    expect(opts).toMatchObject({ httpMethod: 'PUT', headers: ticket.upload_headers });
  }
});

test('gives_up_after_three_attempts', async () => {
  mockUpload.mockResolvedValue({ status: 503 });
  const done = uploadVideo(ticket, 'file:///a.mp4', jest.fn());
  const assertion = expect(done).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
  await jest.runAllTimersAsync();
  await assertion;
  expect(mockCreateTask).toHaveBeenCalledTimes(3);
});

test('ticket_expired_after_expires_at', () => {
  expect(isTicketExpired(ticket, new Date('2026-11-07T00:14:59Z'))).toBe(false);
  expect(isTicketExpired(ticket, new Date('2026-11-07T00:15:00Z'))).toBe(true);
});

test('진행률을 0~1 비율로 알린다', async () => {
  mockUpload.mockResolvedValue({ status: 200 });
  const onProgress = jest.fn();
  await uploadVideo(ticket, 'file:///a.mp4', onProgress);
  const opts = (mockCreateTask.mock.calls[0] as unknown as [string, any])[1];
  opts.onProgress({ bytesSent: 25, totalBytes: 100 });
  expect(onProgress).toHaveBeenLastCalledWith(0.25);
});

test('파일 이름이 없으면 MIME으로 확장자를 채운다', () => {
  expect(videoName('content://media/external/video/1000012', null, 'video/quicktime')).toBe('1000012.mov');
  expect(videoName('file:///cache/a%20b.MP4?x=1')).toBe('a b.MP4');
});

test('확장자, 빈 파일, 200MB를 확인한다', () => {
  expect(checkVideo('a.mkv', 1)).toMatch(/mp4, mov, webm, avi/);
  expect(checkVideo('a.mp4', 0)).toMatch(/빈 파일/);
  expect(checkVideo('a.mp4', MAX_BYTES + 1)).toMatch(/200MB/);
  expect(checkVideo('a.mp4', MAX_BYTES)).toBe('');
});

describe('checkTrim', () => {
  const none = { start: null, end: null };
  test('short_or_unknown_video_needs_no_trim', () => {
    expect(checkTrim(120, none)).toBe('');
    expect(checkTrim(null, none)).toBe('');
  });
  test('trim_shorter_than_one_second_is_rejected', () => {
    expect(checkTrim(20, { start: 3, end: 3.5 })).toBe('구간은 1초 이상이어야 합니다.');
  });
  test('long_video_requires_trim', () => {
    expect(checkTrim(121, none)).toContain('구간을 골라');
    expect(checkTrim(300, { start: 10, end: 70 })).toBe('');
  });
  test('rejects_incomplete_reversed_and_too_long_trim', () => {
    expect(checkTrim(60, { start: 5, end: null })).toContain('모두');
    expect(checkTrim(60, { start: null, end: 5 })).toContain('모두');
    expect(checkTrim(60, { start: 9, end: 9 })).toContain('뒤여야');
    expect(checkTrim(300, { start: 0, end: 120 })).toBe('');
    expect(checkTrim(300, { start: 0, end: 120.5 })).toContain('120초 이하');
  });
});
