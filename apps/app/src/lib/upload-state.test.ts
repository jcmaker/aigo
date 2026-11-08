import { nextUploadState } from './upload-state';

test('탭을 오가면 아무것도 지우지 않는다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'tabReturn')).toEqual({ resetFile: false, dropAttempt: false });
});
test('제출이 끝나면 모두 지운다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'submitted')).toEqual({ resetFile: true, dropAttempt: true });
});
test('공유로 다른 영상이 오면 새로 시작한다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'shared', 'b')).toEqual({ resetFile: true, dropAttempt: true });
});
test('같은 영상이 다시 공유되면 기존 attempt를 살린다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'shared', 'a')).toEqual({ resetFile: false, dropAttempt: false });
});
test('갤러리에서 고른 영상도 같은 규칙이다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'picked', 'b')).toEqual({ resetFile: true, dropAttempt: true });
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'picked', 'a')).toEqual({ resetFile: false, dropAttempt: false });
});
import { afterInFlight } from './upload-state';

test('올리는 중에 다른 영상이 공유되면 미룬다', () => {
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'shared', 'b', true)).toEqual({ resetFile: false, dropAttempt: false, defer: true });
  expect(nextUploadState({ fileUri: 'a', attemptUri: 'a' }, 'shared', 'a', true)).toEqual({ resetFile: false, dropAttempt: false });
});
test('제출 뒤 미뤄 둔 영상이 있으면 그 영상을 열고 attempt를 버린다', () => {
  expect(afterInFlight(true, 'b', true)).toEqual({ resetFile: true, dropAttempt: true, loadUri: 'b' });
});
test('제출 뒤 미뤄 둔 영상이 없으면 비운다. 내 영상이 아니면 건드리지 않는다', () => {
  expect(afterInFlight(true, null, true)).toEqual({ resetFile: true, dropAttempt: true, loadUri: null });
  expect(afterInFlight(true, null, false)).toEqual({ resetFile: false, dropAttempt: false, loadUri: null });
});
test('실패해도 미뤄 둔 영상은 연다. 없으면 그대로 둔다', () => {
  expect(afterInFlight(false, 'b', true)).toEqual({ resetFile: true, dropAttempt: true, loadUri: 'b' });
  expect(afterInFlight(false, null, true)).toEqual({ resetFile: false, dropAttempt: false, loadUri: null });
});
