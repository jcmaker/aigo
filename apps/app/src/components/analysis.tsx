import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Text, View } from 'react-native';
import {
  DISCLAIMER,
  FAILURES,
  LEVEL,
  LIKELIHOOD,
  STAGES,
  caseSource,
  isCaseUrl,
  faultRange,
  signed,
  formatTime,
  type Analysis,
  type Evidence,
  type FaultAssessment,
  type Report,
} from '@/lib/analysis';
import { faultSegments, stageSegments } from '@/lib/ui-logic';
import { Card, Icon, ListRow, Notice, SegmentGauge, SegmentedControl, StatTile, StepList, TimeChip } from '@/components/ui';
import { color, radius, space, type } from '@/theme';

// 웹 ReportView와 같은 항목·문구.
const NO_SCENE = '이 영상에서 사고 장면을 확인하지 못했습니다';
const CONFIDENCE_MEANS = '과실 판단이 맞을 확률이 아니라, 영상에서 충돌 장면과 근거를 얼마나 확인했는지를 뜻합니다.';
const MAX_VIDEO_RELOADS = 2; // 만료가 아닌 이유로 계속 실패해도 분석을 무한히 다시 부르지 않는다.
const body = [type.body, { color: color.gray12 }];
const muted = [type.caption, { color: color.gray11 }];
const strong = [type.label, { color: color.gray12 }];
const CONFIDENCE_COLOR = { high: color.brand600, medium: color.warning600, low: color.danger600 } as const;

export type ReportTab = 'summary' | 'evidence' | 'basis';
const TABS: { value: ReportTab; label: string }[] = [
  { value: 'summary', label: '요약' },
  { value: 'evidence', label: '근거' },
  { value: 'basis', label: '기준' },
];

type Seek = ((t: number) => void) | undefined;

/** 위험·실패 문구 한 줄 */
export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={[type.caption, { color: color.danger600 }]}>{children}</Text>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] }}>
      <Text style={strong}>{label}</Text>
      {typeof value === 'string' ? <Text style={strong}>{value}</Text> : value}
    </View>
  );
}

function EvidenceRows({ items, onSeek }: { items: Evidence[]; onSeek: Seek }) {
  return items.map((e) => <ListRow key={`${e.t}-${e.text}`} leading={<TimeChip seconds={e.t} onPress={onSeek} />} title={e.text} />);
}

/** 파이프라인이 문장 끝에 붙인 "(7.8초)"를 눌러서 이동하는 근거로 바꾼다. */
function Claims({ items, onSeek }: { items: string[]; onSeek: Seek }) {
  return items.map((claim) => {
    const m = claim.match(/^(.*?)\s*\((\d+(?:\.\d+)?)초\)$/);
    return <ListRow key={claim} title={m ? m[1] : claim} trailing={m ? <TimeChip seconds={Number(m[2])} onPress={onSeek} /> : undefined} />;
  });
}

function Steps({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card title={title}>
      {items.map((item, i) => (
        <Text key={item} style={body}>
          {i + 1}. {item}
        </Text>
      ))}
    </Card>
  );
}

function FaultBreakdown({ fault, onSeek }: { fault: FaultAssessment; onSeek: Seek }) {
  return (
    <Card title="과실 근거">
      <Row label="기본과실" value={`${fault.base}%`} />
      {fault.steps.map((s) => (
        <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Text style={strong}>{s.label}</Text>
            <Text style={muted}>{s.evidence.text}</Text>
          </View>
          <TimeChip seconds={s.evidence.t} onPress={onSeek} />
          <Text style={[type.headline, { color: color.gray12 }]}>{signed(s.delta)}</Text>
        </View>
      ))}
      <View style={{ height: 1, backgroundColor: color.gray4 }} />
      <Row label="내 과실 예상" value={<Text style={[type.headline, { color: color.brand600 }]}>{faultRange(fault)}</Text>} />
      <View style={{ gap: space[1] }}>
        <Text style={strong}>기준 도표</Text>
        <Text style={body}>{fault.chart_title}</Text>
        <Text style={muted}>이 도표에서 내 차는 {fault.me}입니다.</Text>
        <Text style={muted}>출처: 과실비율정보포털 ({fault.source_url})</Text>
      </View>
    </Card>
  );
}

function RefCard({ title, items, source }: { title: string; items: { text: string; url: string }[]; source?: string }) {
  if (items.length === 0) return null;
  return (
    <Card title={title}>
      {items.map((i, n) =>
        /^https?:\/\//i.test(i.url) ? (
          <ListRow key={`${n}:${i.url}`} title={i.text} trailing={<Icon name="chevron" size={16} color={color.gray11} />} onPress={() => void WebBrowser.openBrowserAsync(i.url).catch(() => {})} />
        ) : (
          <ListRow key={`${n}:${i.url}`} title={i.text} />
        ),
      )}
      {source && /^https?:\/\//i.test(source) && (
        <ListRow title="출처: 과실비율정보포털" trailing={<Icon name="chevron" size={16} color={color.gray11} />} onPress={() => void WebBrowser.openBrowserAsync(source).catch(() => {})} />
      )}
    </Card>
  );
}

/** 서버 메시지가 제목과 같은 말로 시작하면 두 번 쓰지 않는다. */
export function FailureNotice({ code, message }: { code: string; message: string }) {
  const known = FAILURES[code];
  const title = known?.title ?? '요청을 끝내지 못했습니다';
  const repeated = message.startsWith(title);
  return (
    <View style={{ gap: space[1] }}>
      <Text style={[type.headline, { color: color.danger600 }]}>{repeated ? message : title}</Text>
      {!repeated && <ErrorLine>{message}</ErrorLine>}
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
  const label = failed || abandoned ? '분석 중단' : current >= 0 ? `단계 ${current + 1}/${STAGES.length}` : '대기열';
  const state = failed ? 'failed' : 'running';
  const steps = STAGES.map((s) => {
    const p = byStage.get(s.id);
    const line = p?.status === 'done' ? stageResult(s.id, (p.detail ?? {}) as Detail) : null;
    return { title: s.title, detail: line ?? s.about };
  });

  return (
    <View style={{ gap: space[3] }}>
      <Card>
        <SegmentGauge segments={stageSegments(current, STAGES.length, state)} label={label} value={headline} valueSize={17} />
        {failed && analysis.error && <FailureNotice code={analysis.error.code} message={analysis.error.message} />}
        {abandoned && <Text style={body}>이 분석은 시작되지 않았습니다. 영상을 다시 올려 주세요.</Text>}
        {stale && <Text style={muted}>연결이 불안정합니다. 계속 다시 확인하고 있습니다.</Text>}
      </Card>
      {!abandoned && (
        <Card title="진행 단계">
          <StepList steps={steps} current={current} state={state} />
        </Card>
      )}
      {!failed && !abandoned && <Notice>화면을 닫아도 분석은 계속됩니다. 끝나면 내 분석에서 레포트를 볼 수 있습니다.</Notice>}
    </View>
  );
}

/** 재생이 실패하면(서명 URL 만료) 분석을 다시 불러온다. 오버레이는 그리지 않는다. */
function Video({ url, player, onReload, reloads }: { url: string; player: VideoPlayer; onReload: () => void; reloads: MutableRefObject<number> }) {
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    if (status === 'error' && reloads.current < MAX_VIDEO_RELOADS) {
      reloads.current += 1;
      onReload();
    }
  }, [status, onReload, reloads]);
  return (
    <View style={{ gap: space[1] }}>
      <View style={{ borderRadius: radius.video, overflow: 'hidden', backgroundColor: color.ink }}>
        <VideoView key={url} player={player} nativeControls style={{ width: '100%', aspectRatio: 16 / 9 }} />
      </View>
      {status === 'error' ? <ErrorLine>영상을 재생하지 못했습니다.</ErrorLine> : null}
    </View>
  );
}

function involvementLabel(r: Report) {
  return r.involvement === 'party' ? '내 차 사고' : '제3자 사고';
}

export function ReportView({ analysis, onReload, tab, onTab }: { analysis: Analysis; onReload: () => void; tab: ReportTab; onTab: (t: ReportTab) => void }) {
  const report = analysis.report as Report;
  const url = analysis.playback_url;
  // 탭을 바꿔도 같은 플레이어를 쓴다. 영상은 근거 탭에서만 그린다.
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  const reloads = useRef(0);
  // 근거 탭을 떠나면 VideoView만 사라지고 플레이어는 계속 재생된다.
  useEffect(() => {
    if (tab !== 'evidence') player.pause();
  }, [tab, player]);
  const seek = (t: number) => {
    player.pause();
    player.currentTime = t;
  };
  const onSeek: Seek = url ? seek : undefined;
  // 요약·기준 탭의 시각은 근거 탭으로 넘어가서 이동한다.
  const seekToEvidence: Seek = url
    ? (t) => {
        onTab('evidence');
        seek(t);
      }
    : undefined;
  const { fault, timeline } = report;

  const video = url ? <Video url={url} player={player} onReload={onReload} reloads={reloads} /> : <Text style={muted}>재생할 수 있는 영상이 없습니다.</Text>;
  const notice = (
    <View accessible accessibilityLabel={`주의 ${DISCLAIMER}`}>
      <Notice tone="warn">주의: {DISCLAIMER}</Notice>
    </View>
  );

  if (report.involvement === 'none') {
    return (
      <View style={{ gap: space[3] }}>
        {notice}
        <Card>
          <Text style={[type.title, { color: color.gray12 }]}>{NO_SCENE}</Text>
          {report.reason ? <Text style={body}>{report.reason}</Text> : null}
          <Text style={muted}>분석이 실제 충돌을 놓쳤을 수 있습니다. 아래 영상을 직접 확인해 주세요.</Text>
        </Card>
        {video}
      </View>
    );
  }

  const others = report.facts.filter((f) => !timeline.some((e) => e.t === f.t && e.text === f.text));
  const noFault = report.involvement === 'witness' ? '촬영 차가 당사자가 아니어서 과실비율을 내지 않습니다.' : report.fault_note;
  const confidence = <StatTile label="신뢰도" value={LEVEL[report.confidence]} valueColor={CONFIDENCE_COLOR[report.confidence]} />;

  return (
    <View style={{ gap: space[3] }}>
      <SegmentedControl options={TABS} value={tab} onChange={onTab} />

      {tab === 'summary' && (
        <>
          {notice}
          <Card>
            <Text style={muted}>{involvementLabel(report)}</Text>
            <Text style={[type.title, { color: color.gray12 }]}>{report.accident_type ?? '사고 분석 결과'}</Text>
            {report.summary ? <Text style={body}>{report.summary}</Text> : null}
          </Card>
          <Card title={fault ? '내 과실 예상' : '과실비율'}>
            {fault ? (
              <>
                <SegmentGauge segments={faultSegments(fault.my_min, fault.my_max)} label="예상 범위" value={faultRange(fault)} />
                <View style={{ flexDirection: 'row', gap: space[2] }}>
                  {confidence}
                  <StatTile label="기준 도표" value={fault.chart_id} />
                  <StatTile label="기본과실" value={`${fault.base}%`} />
                </View>
              </>
            ) : (
              <>
                <Text style={strong}>{noFault}</Text>
                <View style={{ flexDirection: 'row' }}>{confidence}</View>
              </>
            )}
            <Text style={muted}>{CONFIDENCE_MEANS}</Text>
            {report.severity && <Row label="심각도" value={LEVEL[report.severity]} />}
            {report.collision_t !== null && <Row label="충돌 시각" value={<TimeChip seconds={report.collision_t} onPress={seekToEvidence} />} />}
          </Card>
          <Steps title="지금 할 일" items={report.actions_now} />
          <Steps title="이후 대응" items={report.actions_later} />
        </>
      )}

      {tab === 'evidence' && (
        <>
          {video}
          <Card title="타임라인">
            <EvidenceRows items={timeline} onSeek={onSeek} />
          </Card>
          {others.length > 0 && (
            <Card title="그 밖에 확인된 사실">
              <EvidenceRows items={others} onSeek={onSeek} />
            </Card>
          )}
          {report.favorable.length > 0 && (
            <Card title="유리한 점">
              <Claims items={report.favorable} onSeek={onSeek} />
            </Card>
          )}
          {report.unfavorable.length > 0 && (
            <Card title="불리한 점">
              <Claims items={report.unfavorable} onSeek={onSeek} />
            </Card>
          )}
          {report.unseen.length > 0 && (
            <Card title="확인할 수 없는 사실">
              {report.unseen.map((u) => (
                <Text key={u} style={body}>
                  {u}
                </Text>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'basis' && (
        <>
          {fault ? (
            <FaultBreakdown fault={fault} onSeek={seekToEvidence} />
          ) : (
            <Card title="과실비율">
              <Text style={strong}>{noFault}</Text>
            </Card>
          )}
          {/* 옛 레포트에는 laws/cases가 없을 수 있다 */}
          <RefCard title="관련 법규" items={(fault?.laws ?? []).map((l) => ({ text: `${l.name} ${l.article}(${l.title})`, url: l.url }))} />
          <RefCard
            title="참고 판례"
            items={(fault?.cases ?? []).map((c) => ({ text: `${c.court} ${c.date} ${c.number}`, url: isCaseUrl(c.url) ? c.url : '' }))}
            source={caseSource(fault?.cases ?? [])}
          />
          {fault && fault.unknown.length > 0 && (
            <Card title="영상으로 판단하지 못한 요소">
              <Text style={muted}>이 요소 때문에 예상 범위가 넓어질 수 있습니다.</Text>
              {fault.unknown.map((u) => (
                <Text key={u} style={strong}>
                  {u}
                </Text>
              ))}
            </Card>
          )}
          {report.serious_violations.length > 0 && (
            <Card title="12대 중과실">
              {report.serious_violations.map((v) => (
                <View key={v.item} style={{ gap: space[1] }}>
                  <Text style={strong}>
                    {v.item} · {LIKELIHOOD[v.likelihood]}
                  </Text>
                  {v.evidence && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                      <TimeChip seconds={v.evidence.t} onPress={seekToEvidence} />
                      <Text style={[muted, { flex: 1 }]}>{v.evidence.text}</Text>
                    </View>
                  )}
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </View>
  );
}
