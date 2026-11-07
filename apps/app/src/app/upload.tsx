import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { FailureNotice } from '@/components/analysis';
import { Button, ErrorText } from '@/components/ui';
import { FAILURES } from '@/lib/analysis';
import { ApiFailure, useApi } from '@/lib/api';
import { registerPush } from '@/lib/push';
import { checkTrim, checkVideo, fileSize, isTicketExpired, uploadVideo, videoName, type UploadTicket } from '@/lib/upload';
import { deleteCached } from '@/lib/cache';

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
  const abort = useRef(new AbortController());

  const player = useVideoPlayer(file?.uri ?? null);

  useEffect(() => () => abort.current.abort(), []);

  const choose = (next: Picked) => {
    const problem = checkVideo(next.name, next.size);
    setFile(problem ? null : next);
    setFileError(problem);
    setFailure(null);
    setTrim({ start: null, end: null });
  };

  // 다른 화면(공유 메뉴, 구간 자르기)이 넘긴 파일. 크기와 이름이 없으면 여기서 구한다.
  const { uri, name, size } = params;
  useEffect(() => {
    if (uri) choose({ uri, name: videoName(uri, name), size: Number(size) || sizeOf(uri), mime: '', duration: null });
  }, [uri, name, size]);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    const a = res.canceled ? null : res.assets[0];
    if (a) choose({ uri: a.uri, name: videoName(a.uri, a.fileName, a.mimeType), size: a.fileSize || sizeOf(a.uri), mime: a.mimeType ?? '', duration: a.duration ? a.duration / 1000 : null });
  }

  async function start() {
    if (!file) return;
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
      registerPush(api, true); // 첫 분석을 낸 뒤에 알림 권한을 묻는다. 기다리지 않는다.
      deleteCached(file.uri); // 올린 뒤에는 앱 캐시의 복사본이 필요 없다.
      router.replace(`/analyses/${a.ticket.id}`);
    } catch (e) {
      if (abort.current.signal.aborted) return; // 화면을 떠났다.
      const err = e instanceof ApiFailure ? e : new ApiFailure(0, 'UPLOAD_FAILED', '영상을 올리지 못했습니다. 다시 시도해 주세요.');
      if (err.code === 'UPLOAD_INCOMPLETE' && attempt.current) attempt.current.uploaded = false;
      setFailure({ code: err.code, message: err.message });
      setPhase('idle');
    } finally {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
  }

  const busy = phase !== 'idle';
  const blocked = !!failure && !!FAILURES[failure.code]?.final;
  // 분석을 이미 만들었으면 구간을 바꿀 수 없다. 바꾸면 새 분석이 필요하고 하루 한도를 또 쓴다.
  const locked = busy || (!!failure && attempt.current?.uri === file?.uri);
  const trimProblem = file ? checkTrim(file.duration, trim) : '';

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Stack.Screen options={{ title: '영상 분석하기' }} />
      <Button label={file ? '다른 영상 고르기' : '갤러리에서 영상 고르기'} secondary disabled={busy} onPress={pick} />
      {file ? (
        <Text>
          {file.name} · {mb(file.size)}
        </Text>
      ) : null}
      <ErrorText>{fileError}</ErrorText>
      {file ? (
        <>
          <VideoView player={player} nativeControls style={{ width: '100%', aspectRatio: 16 / 9 }} />
          <Text>
            구간 {sec(trim.start)} ~ {sec(trim.end)}
            {file.duration !== null ? ` · 전체 ${sec(file.duration)}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="시작으로" secondary disabled={locked} onPress={() => setTrim((t) => ({ ...t, start: player.currentTime }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="끝으로" secondary disabled={locked} onPress={() => setTrim((t) => ({ ...t, end: player.currentTime }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="지우기" secondary disabled={locked} onPress={() => setTrim({ start: null, end: null })} />
            </View>
          </View>
          {locked && !busy ? <Text style={{ color: '#666' }}>이미 올리기를 시작해 구간을 바꿀 수 없습니다. 바꾸려면 다른 영상을 고르세요.</Text> : null}
          <ErrorText>{trimProblem}</ErrorText>
        </>
      ) : null}
      <Text style={{ color: '#666' }}>mp4, mov, webm, avi · 200MB · 2분 이하</Text>

      <Text style={{ fontWeight: '700' }}>올리기 전에 확인하세요</Text>
      <Text>{CONSENT_TEXT}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Switch value={consent} disabled={busy} onValueChange={setConsent} />
        <Text style={{ flex: 1, fontWeight: '600' }}>위 내용을 확인했고 영상 분석에 동의합니다.</Text>
      </View>

      {phase === 'uploading' ? <Text>올리는 중 {percent}%</Text> : null}
      {phase === 'submitting' ? <Text>분석 대기열에 넣는 중</Text> : null}
      {failure ? <FailureNotice {...failure} /> : null}

      <Button label={failure ? '다시 시도' : '올리고 분석 시작'} disabled={!file || !consent || busy || blocked || !!trimProblem} onPress={start} />
    </ScrollView>
  );
}
