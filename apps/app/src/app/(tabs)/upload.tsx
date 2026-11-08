import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorLine, FailureNotice } from '@/components/analysis';
import { Button, Card, ConsentSwitch, EmptyState, Notice, Screen } from '@/components/ui';
import { FAILURES } from '@/lib/analysis';
import { ApiFailure, useApi } from '@/lib/api';
import { registerPush } from '@/lib/push';
import { checkTrim, checkVideo, fileSize, isTicketExpired, uploadVideo, videoName, type UploadTicket } from '@/lib/upload';
import { deleteCached } from '@/lib/cache';
import { afterInFlight, nextUploadState } from '@/lib/upload-state';
import { color, radius, space, type } from '@/theme';

const CONSENT_TEXT = '영상에는 번호판과 얼굴이 담길 수 있고, 분석을 위해 프레임이 OpenAI로 전송되며, 분석을 삭제하면 파일까지 지웁니다.';
const KEEP_AWAKE_TAG = 'aigo-upload';
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const sec = (t: number | null) => (t === null ? '-' : `${t.toFixed(1)}초`);

type Picked = { uri: string; name: string; size: number; mime: string; duration: number | null }; // duration은 초. 모르면 null
type Phase = 'idle' | 'uploading' | 'submitting';
type Attempt = { uri: string; ticket: UploadTicket; trimKey: string; uploaded: boolean };

const sizeOf = (uri: string) => {
  try {
    return fileSize(uri);
  } catch {
    return 0;
  }
};

export default function UploadScreen() {
  const params = useLocalSearchParams<{ uri?: string; name?: string; size?: string }>();
  const api = useApi();
  const router = useRouter();
  const [file, setFile] = useState<Picked | null>(null);
  const [fileError, setFileError] = useState('');
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState(0);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [trim, setTrim] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false); // start()가 도는 동안 true
  const pending = useRef<{ next: Picked; event: 'shared' | 'picked' } | null>(null); // 올리는 중에 들어온 영상
  const fileUri = useRef<string | null>(null);
  fileUri.current = file?.uri ?? null;
  const abort = useRef(new AbortController());

  const player = useVideoPlayer(file?.uri ?? null);

  useEffect(() => () => abort.current.abort(), []);

  // 같은 영상이면 그대로 둔다(탭을 오가거나 같은 영상이 다시 공유돼도 올리던 attempt를 살린다).
  const apply = (next: Picked, event: 'shared' | 'picked') => {
    if (event === 'shared') setConsent(false);
    const problem = checkVideo(next.name, next.size);
    setFile(problem ? null : next);
    setFileError(problem);
    setFailure(null);
    setTrim({ start: null, end: null });
  };
  const choose = (next: Picked, event: 'shared' | 'picked') => {
    const r = nextUploadState({ fileUri: fileUri.current, attemptUri: attempt.current?.uri ?? null }, event, next.uri, inFlight.current);
    if (r.defer) pending.current = { next, event }; // 올리기가 끝난 뒤에 연다.
    if (!r.resetFile) return;
    if (r.dropAttempt) attempt.current = null;
    apply(next, event);
  };
  // 올리기가 끝난 뒤: 미뤄 둔 영상이 있으면 열고 옛 attempt를 버린다. 성공했으면 내 영상만 비운다.
  const settle = (ok: boolean, ownUri: string) => {
    const p = pending.current;
    pending.current = null;
    const r = afterInFlight(ok, p?.next.uri ?? null, fileUri.current === ownUri);
    if (r.dropAttempt) attempt.current = null;
    if (p) apply(p.next, p.event);
    else if (r.resetFile) {
      setFile(null);
      setTrim({ start: null, end: null });
      setConsent(false);
      setFailure(null);
    }
  };

  // 다른 화면(공유 메뉴, 구간 자르기)이 넘긴 파일. 크기와 이름이 없으면 여기서 구한다.
  const { uri, name, size } = params;
  useEffect(() => {
    if (uri) choose({ uri, name: videoName(uri, name), size: Number(size) || sizeOf(uri), mime: '', duration: null }, 'shared');
  }, [uri, name, size]);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    const a = res.canceled ? null : res.assets[0];
    if (a) choose({ uri: a.uri, name: videoName(a.uri, a.fileName, a.mimeType), size: a.fileSize || sizeOf(a.uri), mime: a.mimeType ?? '', duration: a.duration ? a.duration / 1000 : null }, 'picked');
  }

  async function start() {
    if (!file) return;
    inFlight.current = true;
    setFailure(null);
    setPercent(0);
    setPhase('uploading');
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    try {
      // 재시도는 같은 분석을 다시 쓴다. 서명 URL이 만료됐을 때만 새로 만든다(새로 만들면 하루 한도를 또 쓴다).
      let a = attempt.current;
      const trimKey = `${trim.start}~${trim.end}`;
      if (!a || a.uri !== file.uri || a.trimKey !== trimKey || (!a.uploaded && isTicketExpired(a.ticket, new Date()))) {
        const ticket = await api<UploadTicket>('/api/v1/analyses', {
          method: 'POST',
          body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.mime, consent, ...(trim.start !== null && trim.end !== null && { trim_start: trim.start, trim_end: trim.end }) }),
        });
        a = attempt.current = { uri: file.uri, trimKey, ticket, uploaded: false };
      }
      if (!a.uploaded) {
        await uploadVideo(a.ticket, file.uri, (r) => setPercent(Math.round(r * 100)), abort.current.signal);
        a.uploaded = true;
      }
      setPhase('submitting');
      await api(`/api/v1/analyses/${a.ticket.id}/submit`, { method: 'POST' });
      // 같은 영상을 다시 공유받아도 새 params로 보이게 지운다.
      router.setParams({ uri: undefined, name: undefined, size: undefined });
      registerPush(api, true); // 첫 분석을 낸 뒤에 알림 권한을 묻는다. 기다리지 않는다.
      deleteCached(file.uri); // 올린 뒤에는 앱 캐시의 복사본이 필요 없다.
      const id = a.ticket.id;
      // 제출이 끝났으니 내 영상과 attempt를 비운다(미뤄 둔 영상이 있으면 그 영상을 연다).
      settle(true, a.uri);
      setPhase('idle');
      // 탭 묶음 위에 쌓는다. replace하면 (tabs)가 통째로 바뀌어 뒤로가기에 앱이 닫힌다.
      router.push(`/analyses/${id}`);
    } catch (e) {
      if (abort.current.signal.aborted) return; // 화면을 떠났다.
      const err = e instanceof ApiFailure ? e : new ApiFailure(0, 'UPLOAD_FAILED', '영상을 올리지 못했습니다. 다시 시도해 주세요.');
      if (err.code === 'UPLOAD_INCOMPLETE' && attempt.current) attempt.current.uploaded = false;
      setFailure({ code: err.code, message: err.message });
      setPhase('idle');
      if (pending.current) settle(false, file.uri);
    } finally {
      inFlight.current = false;
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
  }

  const busy = phase !== 'idle';
  const blocked = !!failure && !!FAILURES[failure.code]?.final;
  // 분석을 이미 만들었으면 구간을 바꿀 수 없다. 바꾸면 새 분석이 필요하고 하루 한도를 또 쓴다.
  const locked = busy || (!!failure && attempt.current?.uri === file?.uri);
  const trimProblem = file ? checkTrim(file.duration, trim) : '';

  const muted = [type.caption, { color: color.gray11 }];

  return (
    <Screen scroll tabInset>
      <Text accessibilityRole="header" style={[type.title, { color: color.gray12, paddingTop: space[2] }]}>영상 분석하기</Text>
      {file ? (
        <>
          <Text style={muted}>
            {file.name} · {mb(file.size)}
          </Text>
          <View style={{ borderRadius: radius.video, overflow: 'hidden', backgroundColor: color.ink }}>
            <VideoView player={player} nativeControls style={{ width: '100%', aspectRatio: 16 / 9 }} />
          </View>
          <TrimBar duration={file.duration} start={trim.start} end={trim.end} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.label, { color: color.gray12 }]}>
              구간 {sec(trim.start)} ~ {sec(trim.end)}
            </Text>
            {file.duration !== null ? <Text style={muted}>전체 {sec(file.duration)}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <Button label="시작으로" size="md" variant="secondary" disabled={locked} onPress={() => setTrim((t) => ({ ...t, start: player.currentTime }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="끝으로" size="md" variant="secondary" disabled={locked} onPress={() => setTrim((t) => ({ ...t, end: player.currentTime }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="지우기" size="md" variant="secondary" disabled={locked} onPress={() => setTrim({ start: null, end: null })} />
            </View>
          </View>
          {locked && !busy ? <Text style={muted}>이미 올리기를 시작해 구간을 바꿀 수 없습니다. 바꾸려면 다른 영상을 고르세요.</Text> : null}
          <ErrorLine>{trimProblem}</ErrorLine>
          <Button label="다른 영상 고르기" variant="secondary" disabled={busy} onPress={pick} />
        </>
      ) : (
        <Card>
          <EmptyState icon="video" title="어떤 영상을 분석할까요?">
            <Button label="갤러리에서 영상 고르기" icon="image" disabled={busy} onPress={pick} />
          </EmptyState>
        </Card>
      )}
      <ErrorLine>{fileError}</ErrorLine>
      <Text style={muted}>mp4, mov, webm, avi · 200MB · 2분 이하</Text>

      <Notice>
        <Text style={{ fontWeight: '700' }}>올리기 전에 확인하세요{'\n'}</Text>
        {CONSENT_TEXT}
      </Notice>
      <ConsentSwitch value={consent} disabled={busy} onChange={setConsent} label="위 내용을 확인했고 영상 분석에 동의합니다." />

      {phase === 'uploading' ? <Text style={[type.label, { color: color.gray12 }]}>올리는 중 {percent}%</Text> : null}
      {phase === 'submitting' ? <Text style={[type.label, { color: color.gray12 }]}>분석 대기열에 넣는 중</Text> : null}
      {failure ? (
        <Card>
          <FailureNotice {...failure} />
        </Card>
      ) : null}

      <Button label={failure ? '다시 시도' : '올리고 분석 시작'} loading={busy} disabled={!file || !consent || blocked || !!trimProblem} onPress={start} />
    </Screen>
  );
}

/** 전체 길이 대비 고른 구간. 길이를 모르면 그리지 않는다. */
function TrimBar({ duration, start, end }: { duration: number | null; start: number | null; end: number | null }) {
  if (!duration) return null;
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%` as const;
  const from = start ?? 0;
  const to = end ?? duration;
  return (
    <View style={{ height: 12, borderRadius: radius.pill, backgroundColor: color.gray4 }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: pct(from), width: pct(Math.max(0, to - from)), borderRadius: radius.pill, borderWidth: 2, borderColor: color.brand, backgroundColor: color.brand200 }} />
    </View>
  );
}
