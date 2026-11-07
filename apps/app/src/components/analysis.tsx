import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  DISCLAIMER,
  FAILURES,
  LEVEL,
  LIKELIHOOD,
  STAGES,
  faultRange,
  signed,
  formatTime,
  type Analysis,
  type Evidence,
  type FaultAssessment,
  type Report,
} from '@/lib/analysis';
import { ErrorText, styles } from '@/components/ui';

// 웹 ReportView와 같은 항목·문구. 기능 확인용 최소 스타일만 쓴다.
const NO_SCENE = '이 영상에서 사고 장면을 확인하지 못했습니다';
const CONFIDENCE_MEANS = '과실 판단이 맞을 확률이 아니라, 영상에서 충돌 장면과 근거를 얼마나 확인했는지를 뜻합니다.';
const MAX_VIDEO_RELOADS = 2; // 만료가 아닌 이유로 계속 실패해도 분석을 무한히 다시 부르지 않는다.
const bold = { fontWeight: '700' as const };
const muted = { color: '#666' };

type Seek = ((t: number) => void) | undefined;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.title, { fontSize: 18 }]}>{title}</Text>
      {children}
    </View>
  );
}

function Time({ t, onSeek }: { t: number; onSeek: Seek }) {
  if (!onSeek) return <Text style={muted}>{formatTime(t)}</Text>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${formatTime(t)} 장면으로 이동`} onPress={() => onSeek(t)}>
      <Text style={{ textDecorationLine: 'underline' }}>{formatTime(t)}</Text>
    </Pressable>
  );
}

function EvidenceRows({ items, onSeek }: { items: Evidence[]; onSeek: Seek }) {
  return items.map((e) => (
    <View key={`${e.t}-${e.text}`} style={{ flexDirection: 'row', gap: 12 }}>
      <Time t={e.t} onSeek={onSeek} />
      <Text style={{ flex: 1 }}>{e.text}</Text>
    </View>
  ));
}

/** 파이프라인이 문장 끝에 붙인 "(7.8초)"를 눌러서 이동하는 근거로 바꾼다. */
function Claims({ items, onSeek }: { items: string[]; onSeek: Seek }) {
  return items.map((claim) => {
    const m = claim.match(/^(.*?)\s*\((\d+(?:\.\d+)?)초\)$/);
    return (
      <View key={claim} style={{ flexDirection: 'row', gap: 12 }}>
        <Text style={{ flex: 1 }}>{m ? m[1] : claim}</Text>
        {m && <Time t={Number(m[2])} onSeek={onSeek} />}
      </View>
    );
  });
}

function Steps({ title, items }: { title: string; items: string[] }) {
  return (
    <Section title={title}>
      {items.map((item, i) => (
        <Text key={item}>
          {i + 1}. {item}
        </Text>
      ))}
    </Section>
  );
}

function FaultBreakdown({ fault, onSeek }: { fault: FaultAssessment; onSeek: Seek }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={bold}>기본과실</Text>
        <Text style={bold}>{fault.base}</Text>
      </View>
      {fault.steps.map((s) => (
        <View key={s.label} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={bold}>{s.label}</Text>
            <Text style={muted}>{s.evidence.text}</Text>
          </View>
          <Time t={s.evidence.t} onSeek={onSeek} />
          <Text style={bold}>{signed(s.delta)}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={bold}>내 과실 예상</Text>
        <Text style={bold}>{faultRange(fault)}</Text>
      </View>
      <Text style={bold}>기준 도표</Text>
      <Text>{fault.chart_title}</Text>
      <Text style={muted}>이 도표에서 내 차는 {fault.me}입니다.</Text>
      <Text style={muted}>출처: 과실비율정보포털 ({fault.source_url})</Text>
      {fault.unknown.length > 0 && (
        <>
          <Text style={bold}>영상으로 판단하지 못한 요소</Text>
          <Text style={muted}>이 요소 때문에 예상 범위가 넓어질 수 있습니다.</Text>
          {fault.unknown.map((u) => (
            <Text key={u} style={bold}>
              {u}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

/** 서버 메시지가 제목과 같은 말로 시작하면 두 번 쓰지 않는다. */
export function FailureNotice({ code, message }: { code: string; message: string }) {
  const known = FAILURES[code];
  const title = known?.title ?? '요청을 끝내지 못했습니다';
  const repeated = message.startsWith(title);
  return (
    <View style={{ gap: 2 }}>
      <Text style={[bold, { color: '#c00' }]}>{repeated ? message : title}</Text>
      {!repeated && <ErrorText>{message}</ErrorText>}
      {known?.hint ? <Text style={muted}>{known.hint}</Text> : null}
    </View>
  );
}

type Detail = { duration?: number; width?: number; height?: number; frames?: number; tracks?: number; candidates?: number[]; extra_focus?: boolean };

function stageResult(id: string, d: Detail) {
  switch (id) {
    case 'normalize':
      return `길이 ${formatTime(d.duration ?? 0)} · ${d.width}×${d.height}`;
    case 'scan':
      return `프레임 ${d.frames}장 · 객체 ${d.tracks}개`;
    case 'locate':
      return d.candidates?.length ? `후보 ${d.candidates.length}곳: ${d.candidates.map(formatTime).join(', ')}` : '뚜렷한 후보가 없어 고르게 살펴봅니다';
    case 'focus':
      return `프레임 ${d.frames}장 선택`;
    case 'observe':
      return `프레임 ${d.frames}장 확인${d.extra_focus ? ' · 충돌 주변을 다시 봤습니다' : ''}`;
    default:
      return null;
  }
}

export function ProgressView({ analysis, stale }: { analysis: Analysis; stale: boolean }) {
  const failed = analysis.status === 'failed';
  const abandoned = analysis.status === 'created';
  const byStage = new Map(analysis.progress.map((p) => [p.stage, p]));
  const current = STAGES.findIndex((s) => s.id === analysis.stage);
  const headline = failed
    ? '분석을 끝내지 못했습니다'
    : abandoned
      ? '영상이 끝까지 올라가지 않았습니다'
      : (STAGES[current]?.doing ?? '분석 순서를 기다리는 중');

  return (
    <View style={{ gap: 12 }}>
      <Text style={muted}>{failed || abandoned ? '분석 중단' : current >= 0 ? `단계 ${current + 1}/${STAGES.length}` : '대기열'}</Text>
      <Text style={styles.title}>{headline}</Text>
      {!failed && !abandoned && <Text style={muted}>화면을 닫아도 분석은 계속됩니다. 끝나면 내 분석에서 레포트를 볼 수 있습니다.</Text>}
      {failed && analysis.error && <FailureNotice code={analysis.error.code} message={analysis.error.message} />}
      {abandoned && <Text>이 분석은 시작되지 않았습니다. 영상을 다시 올려 주세요.</Text>}
      {stale && <Text style={muted}>연결이 불안정합니다. 계속 다시 확인하고 있습니다.</Text>}
      {!abandoned &&
        STAGES.map((s, i) => {
          const p = byStage.get(s.id);
          const done = p?.status === 'done';
          const label = done ? '완료' : !p ? '대기' : failed ? '중단' : '진행 중';
          const line = done ? stageResult(s.id, (p.detail ?? {}) as Detail) : null;
          return (
            <View key={s.id} style={{ gap: 2, opacity: p ? 1 : 0.55 }}>
              <Text style={bold}>
                {String(i + 1).padStart(2, '0')} {s.title} · {label}
              </Text>
              <Text style={muted}>{s.about}</Text>
              {line ? <Text>{line}</Text> : null}
            </View>
          );
        })}
    </View>
  );
}

/** 재생이 실패하면(서명 URL 만료) 분석을 다시 불러온다. 오버레이는 그리지 않는다. */
function Video({ url, player, onReload }: { url: string; player: VideoPlayer; onReload: () => void }) {
  const reloads = useRef(0);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    if (status === 'error' && reloads.current < MAX_VIDEO_RELOADS) {
      reloads.current += 1;
      onReload();
    }
  }, [status, onReload]);
  return (
    <View style={{ gap: 4 }}>
      <VideoView key={url} player={player} nativeControls style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }} />
      {status === 'error' ? <ErrorText>영상을 재생하지 못했습니다.</ErrorText> : null}
    </View>
  );
}

export function ReportView({ analysis, onReload }: { analysis: Analysis; onReload: () => void }) {
  const report = analysis.report as Report;
  const url = analysis.playback_url;
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  const seek = (t: number) => {
    player.pause();
    player.currentTime = t;
  };
  const onSeek: Seek = url ? seek : undefined;
  const { fault, timeline } = report;

  const video = url ? <Video url={url} player={player} onReload={onReload} /> : <Text style={muted}>재생할 수 있는 영상이 없습니다.</Text>;
  const notice = (
    <Text style={bold} accessibilityLabel={`주의 ${DISCLAIMER}`}>
      주의: {DISCLAIMER}
    </Text>
  );

  if (report.involvement === 'none') {
    return (
      <View style={{ gap: 12 }}>
        {notice}
        <Text style={styles.title}>{NO_SCENE}</Text>
        {report.reason ? <Text>{report.reason}</Text> : null}
        <Text style={muted}>분석이 실제 충돌을 놓쳤을 수 있습니다. 아래 영상을 직접 확인해 주세요.</Text>
        {video}
      </View>
    );
  }

  const others = report.facts.filter((f) => !timeline.some((e) => e.t === f.t && e.text === f.text));

  return (
    <View style={{ gap: 20 }}>
      {notice}
      <Section title="결론">
        <Text style={muted}>{report.involvement === 'party' ? '내 차 사고' : '제3자 사고'}</Text>
        <Text style={styles.title}>{report.accident_type ?? '사고 분석 결과'}</Text>
        {report.summary ? <Text>{report.summary}</Text> : null}
        {fault ? (
          <>
            <Text style={muted}>내 과실 예상</Text>
            <Text style={[styles.title, { fontSize: 36 }]}>{faultRange(fault)}</Text>
            <Text style={muted}>기본 {fault.base}</Text>
          </>
        ) : (
          <>
            <Text style={muted}>과실비율</Text>
            <Text style={bold}>
              {report.involvement === 'witness' ? '촬영 차가 당사자가 아니어서 과실비율을 내지 않습니다.' : report.fault_note}
            </Text>
          </>
        )}
        <Text style={bold}>신뢰도 {LEVEL[report.confidence]}</Text>
        <Text style={muted}>{CONFIDENCE_MEANS}</Text>
        {report.severity && <Text style={bold}>심각도 {LEVEL[report.severity]}</Text>}
        {report.collision_t !== null && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={bold}>충돌 시각</Text>
            <Time t={report.collision_t} onSeek={onSeek} />
          </View>
        )}
      </Section>

      <Section title="영상과 타임라인">
        {video}
        <Text style={bold}>타임라인</Text>
        <EvidenceRows items={timeline} onSeek={onSeek} />
        {others.length > 0 && (
          <>
            <Text style={[bold, muted]}>그 밖에 확인된 사실</Text>
            <EvidenceRows items={others} onSeek={onSeek} />
          </>
        )}
      </Section>

      {fault && (
        <Section title="과실 근거">
          <FaultBreakdown fault={fault} onSeek={onSeek} />
        </Section>
      )}

      {report.favorable.length > 0 && (
        <Section title="유리한 점">
          <Claims items={report.favorable} onSeek={onSeek} />
        </Section>
      )}
      {report.unfavorable.length > 0 && (
        <Section title="불리한 점">
          <Claims items={report.unfavorable} onSeek={onSeek} />
        </Section>
      )}

      {report.serious_violations.length > 0 && (
        <Section title="12대 중과실">
          {report.serious_violations.map((v) => (
            <View key={v.item} style={{ gap: 2 }}>
              <Text style={bold}>
                {v.item} · {LIKELIHOOD[v.likelihood]}
              </Text>
              {v.evidence && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Time t={v.evidence.t} onSeek={onSeek} />
                  <Text style={[muted, { flex: 1 }]}>{v.evidence.text}</Text>
                </View>
              )}
            </View>
          ))}
        </Section>
      )}

      {report.unseen.length > 0 && (
        <Section title="확인할 수 없는 사실">
          {report.unseen.map((u) => (
            <Text key={u}>{u}</Text>
          ))}
        </Section>
      )}

      {report.actions_now.length > 0 && <Steps title="지금 할 일" items={report.actions_now} />}
      {report.actions_later.length > 0 && <Steps title="이후 대응" items={report.actions_later} />}
    </View>
  );
}
