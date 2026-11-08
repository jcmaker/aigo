type Prev = { fileUri: string | null; attemptUri: string | null };
type Result = { resetFile: boolean; dropAttempt: boolean; defer?: true };

// 탭을 오가도 고른 영상과 올리던 attempt는 남는다. 다른 영상이 오거나 제출이 끝났을 때만 지운다.
// 올리는 중(busy)에 다른 영상이 오면 지금 바꾸지 않고 미룬다(defer). 끝난 뒤 afterInFlight로 적용한다.
export function nextUploadState(prev: Prev, event: 'shared' | 'picked' | 'submitted' | 'tabReturn', incomingUri?: string, busy = false): Result {
  const incoming = (event === 'shared' || event === 'picked') && incomingUri !== prev.fileUri;
  if (incoming && busy) return { resetFile: false, dropAttempt: false, defer: true };
  const reset = event === 'submitted' || incoming;
  return { resetFile: reset, dropAttempt: reset };
}

// 올리기가 끝난 뒤. 미뤄 둔 영상이 있으면 옛 attempt를 버리고 그 영상을 연다.
// 성공이면 내 영상이 그대로일 때(ownsFile)만 비운다. 실패는 미뤄 둔 영상이 있을 때만 바꾼다.
export function afterInFlight(ok: boolean, pendingUri: string | null, ownsFile: boolean): { resetFile: boolean; dropAttempt: boolean; loadUri: string | null } {
  const reset = pendingUri !== null || (ok && ownsFile);
  return { resetFile: reset, dropAttempt: reset, loadUri: pendingUri };
}
