import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Text, View } from 'react-native';
import {
  DISCLAIMER,
  FAILURES,
  LEVEL,
  STAGES,
  caseSource,
  isCaseUrl,
  formatTime,
  type Analysis,
  type Evidence,
  type Report,
} from '@/lib/analysis';
import { hintAt, liveProgress } from '@/lib/progress';
import { useNow } from '@/lib/use-now';
import { useReduceMotion } from '@/lib/use-reduce-motion';
import { Card, Icon, ListRow, Notice, StepList } from '@/components/ui';
import { CautionCard, CautionText, ChartSource, DarkCard, DotList, EvidenceLine, FaultHeadline, FaultProcess, Footer, LinkRow, NumberedList, RangeWhy, ReportTabs, SeriousViolations, VerticalTimeline, ClaimLines, type Seek } from '@/components/report-sections';
import { color, radius, space, type } from '@/theme';

// 웹 ReportView와 같은 항목·문구.
const NO_SCENE = '이 영상에서 사고 장면을 확인하지 못했습니다';
const CONFIDENCE_MEANS = '과실 판단이 맞을 확률이 아니라, 영상에서 충돌 장면과 근거를 얼마나 확인했는지를 뜻합니다.';
const MAX_VIDEO_RELOADS = 2; // 만료가 아닌 이유로 계속 실패해도 분석을 무한히 다시 부르지 않는다.
const body = [type.body, { color: color.gray12 }];
const muted = [type.caption, { color: color.gray11 }];
const strong = [type.label, { color: color.gray12 }];

export type ReportTab = 'summary' | 'evidence' | 'basis';
const TABS: { value: ReportTab; label: string }[] = [
  { value: 'summary', label: '요약' },
  { value: 'evidence', label: '근거' },
  { value: 'basis', label: '기준' },
];


/** 위험·실패 문구 한 줄 */
export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={[type.caption, { color: color.danger600 }]}>{children}</Text>;
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
  const title = known?.title ?? '요청을 끝내지 못했어요';
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

// 안내 문구가 바뀔 때마다 살짝 떠오르며 나타난다.
function FadeText({ text, still, style }: { text: string; still: boolean; style: object }) {
  const show = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (still) return;
    show.setValue(0);
    Animated.timing(show, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [text, show, still]);
  const translateY = show.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  return <Animated.Text style={[style, { opacity: show, transform: [{ translateY }] }]}>{text}</Animated.Text>;
}

// 진행 막대: 폭은 1초 동안 부드럽게 따라가고, 위로 빛 띠가 지나간다. 100%는 완료 때만(liveProgress).
function ProgressBar({ ratio, still }: { ratio: number; still: boolean }) {
  const width = useRef(new Animated.Value(ratio)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: ratio, duration: still ? 0 : 900, easing: Easing.linear, useNativeDriver: false }).start();
  }, [ratio, width, still]);
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(sheen, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [sheen, still]);
  const pct = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const translateX = sheen.interpolate({ inputRange: [0, 1], outputRange: [-120, 360] });
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: color.mintSoft, overflow: 'hidden' }}>
      <Animated.View style={{ width: pct, height: '100%', borderRadius: 999, backgroundColor: color.mintDeep, overflow: 'hidden' }}>
        {!still && <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 60, backgroundColor: 'rgba(255,255,255,0.35)', transform: [{ translateX }] }} />}
      </Animated.View>
    </View>
  );
}

export function ProgressView({ analysis, stale }: { analysis: Analysis; stale: boolean }) {
  const failed = analysis.status === 'failed';
  const abandoned = analysis.status === 'created';
  const running = !failed && !abandoned;
  const still = useReduceMotion();
  const now = useNow(running);
  // 처음 본 시작 시각을 기억한다. 첫 단계가 끝나면 서버가 그 시각을 완료 시각으로 덮어쓴다.
  const start = useRef<number | null>(null);
  const firstAt = Date.parse(analysis.progress[0]?.at ?? '');
  if (!Number.isNaN(firstAt)) start.current = start.current === null ? firstAt : Math.min(start.current, firstAt);
  const live = liveProgress(analysis, now, start.current ?? undefined);
  const current = live.current;
  const byStage = new Map(analysis.progress.map((p) => [p.stage, p]));
  const headline = failed
    ? '분석을 끝내지 못했어요'
    : abandoned
      ? '영상이 끝까지 올라가지 않았어요'
      : (STAGES[current]?.doing ?? '곧 분석을 시작해요');
  const label = failed || abandoned ? '분석 중단' : current >= 0 ? `${current + 1}/${STAGES.length} 단계` : '대기 중';
  const state = failed ? 'failed' : 'running';
  const hint = running && current >= 0 ? hintAt(current, live.stageSec ?? 0) : null;
  const steps = STAGES.map((s, i) => {
    const p = byStage.get(s.id);
    const line = p?.status === 'done' ? stageResult(s.id, (p.detail ?? {}) as Detail) : null;
    const active = running && i === current;
    return {
      title: s.title,
      detail: active && hint ? hint : (line ?? s.about),
      time: active && live.stageSec !== null ? `${live.stageSec}초` : undefined,
    };
  });

  return (
    <View style={{ gap: space[3] }}>
      <Card>
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.label, { color: failed || abandoned ? color.danger600 : color.mintDeep }]}>{label}</Text>
            {running && live.elapsedSec !== null ? <Text style={muted}>{`경과 ${formatTime(live.elapsedSec)}`}</Text> : null}
          </View>
          <Text accessibilityRole="header" style={[type.title, { color: color.gray12 }]}>{headline}</Text>
          {hint ? <FadeText text={hint} still={still} style={[type.body, { color: color.gray11 }]} /> : null}
          {running && <ProgressBar ratio={live.ratio} still={still} />}
        </View>
        {failed && analysis.error && <FailureNotice code={analysis.error.code} message={analysis.error.message} />}
        {abandoned && <Text style={body}>이 분석은 시작되지 않았습니다. 영상을 다시 올려 주세요.</Text>}
        {stale && <Text style={muted}>연결이 불안정합니다. 계속 다시 확인하고 있습니다.</Text>}
      </Card>
      {/* 기다리지 않아도 된다는 안내를 진행 카드 바로 아래에 둔다(ADR 0037). */}
      {running && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.mintSoft, borderRadius: radius.row, padding: space[4] }}>
          <Icon name="check" size={18} color={color.mintDeep} />
          <Text style={[type.body, { flex: 1, fontSize: 15, lineHeight: 22, color: color.gray12 }]}>화면을 닫아도 분석은 계속돼요. 끝나면 내 분석에서 볼 수 있어요.</Text>
        </View>
      )}
      {!abandoned && (
        <Card title="진행 단계">
          <StepList steps={steps} current={current} state={state} reduceMotion={still} />
        </Card>
      )}
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

/** 영상이 없을 때. 임의의 영상을 넣지 않고 상태만 알린다. */
function NoVideo() {
  return (
    <DarkCard>
      <Text style={[type.headline, { color: color.white }]}>재생할 수 있는 영상이 없습니다</Text>
      <Text style={[type.caption, { lineHeight: 19, color: color.brand400 }]}>원본 영상이 제공되면 시각을 눌러 해당 장면으로 이동할 수 있습니다.</Text>
    </DarkCard>
  );
}

// 요약 탭에는 타임라인에서 접촉 장면과 그 앞뒤까지 최대 3개만 보이고, 나머지는 근거 탭으로 보낸다.
function keyScenes(timeline: Evidence[], collisionT: number | null): Evidence[] {
  if (timeline.length <= 3) return timeline;
  const hit = collisionT === null ? -1 : timeline.findIndex((e) => Math.abs(e.t - collisionT) < 0.05);
  const start = hit < 0 ? 0 : Math.max(0, Math.min(hit - 1, timeline.length - 3));
  return timeline.slice(start, start + 3);
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
  const video = url ? <Video url={url} player={player} onReload={onReload} reloads={reloads} /> : <NoVideo />;

  if (report.involvement === 'none') {
    return (
      <View style={{ gap: space[3] }}>
        <Card>
          <Text style={[type.title, { color: color.gray12 }]}>{NO_SCENE}</Text>
          {report.reason ? <Text style={body}>{report.reason}</Text> : null}
          <Text style={muted}>분석이 실제 충돌을 놓쳤을 수 있습니다. 아래 영상을 직접 확인해 주세요.</Text>
        </Card>
        {video}
        <Footer text={DISCLAIMER} />
      </View>
    );
  }

  const others = report.facts.filter((f) => !timeline.some((e) => e.t === f.t && e.text === f.text));
  const noFault = report.involvement === 'witness' ? '촬영 차가 당사자가 아니어서 과실비율을 내지 않습니다.' : report.fault_note;
  // 영상으로 확인하지 못한 것: 사실(unseen)과 과실 수정요소(fault.unknown)를 한 곳에 모은다. 겹치면 한 번만.
  const unconfirmed = Array.from(new Set([...report.unseen, ...(fault?.unknown ?? [])]));
  const scenes = keyScenes(timeline, report.collision_t);

  return (
    <View style={{ gap: space[3] }}>
      <ReportTabs options={TABS} value={tab} onChange={onTab} />

      {tab === 'summary' && (
        <>
          <DarkCard label="사고 분석 요약">
            <Text style={[type.caption, { color: color.brand400 }]}>{involvementLabel(report)}</Text>
            <Text style={[type.title, { color: color.white }]}>{report.accident_type ?? '사고 분석 결과'}</Text>
            {report.summary ? <Text style={[type.body, { lineHeight: 22, color: '#DCE4F2' }]}>{report.summary}</Text> : null}
            {report.severity && <Text style={[type.caption, { color: color.brand400 }]}>심각도 {LEVEL[report.severity]}</Text>}
            <View style={{ height: 1, backgroundColor: color.ink3, marginVertical: space[1] }} />
            <FaultHeadline fault={fault} note={noFault} confidence={report.confidence} collisionT={report.collision_t} onSeek={seekToEvidence} onBasis={() => onTab('basis')} />
          </DarkCard>
          {/* 리포트에서 가장 궁금한 내 과실 범위가 첫 화면에 보이게 요약 카드를 맨 위에 둔다. 현장에서 급한 일은 사고 현장 모드가 맡는다(ADR 0046). */}
          {report.actions_now.length > 0 && (
            <Card title="지금 먼저 할 일">
              <NumberedList items={report.actions_now} />
            </Card>
          )}
          {scenes.length > 0 && (
            <Card title="영상에서 확인한 장면">
              {scenes.map((e) => (
                <EvidenceLine key={`${e.t}-${e.text}`} e={e} onSeek={seekToEvidence} />
              ))}
              {timeline.length > scenes.length && <LinkRow label="전체 타임라인 보기" onPress={() => onTab('evidence')} />}
            </Card>
          )}
          {unconfirmed.length > 0 && (
            <CautionCard title="확인되지 않은 조건">
              <CautionText>{unconfirmed.join(', ')}은(는) 영상만으로 확인하기 어렵습니다. 예상 과실 범위에도 영향을 줄 수 있어요.</CautionText>
            </CautionCard>
          )}
          {report.actions_later.length > 0 && (
            <Card title="이후 대응">
              <DotList items={report.actions_later} tone="gray" />
            </Card>
          )}
          <Footer text={DISCLAIMER} />
        </>
      )}

      {tab === 'evidence' && (
        <>
          {video}
          <Card title="장면 타임라인">
            <Text style={muted}>영상에서 관찰된 장면을 시간 순서대로 정리했어요.{onSeek ? ' 항목을 누르면 그 장면으로 이동해요.' : ''}</Text>
            {timeline.length > 0 ? <VerticalTimeline items={timeline} collisionT={report.collision_t} onSeek={onSeek} /> : <Text style={body}>정리된 장면이 없습니다.</Text>}
          </Card>
          {others.length > 0 && (
            <Card title="추가로 확인한 사실">
              {others.map((e) => (
                <EvidenceLine key={`${e.t}-${e.text}`} e={e} onSeek={onSeek} />
              ))}
            </Card>
          )}
          {(report.favorable.length > 0 || report.unfavorable.length > 0) && (
            <Card title="판단에 사용한 근거">
              {report.favorable.length > 0 && (
                <View style={{ gap: space[2] }}>
                  <Text style={strong}>유리한 점</Text>
                  <ClaimLines items={report.favorable} onSeek={onSeek} />
                </View>
              )}
              {report.unfavorable.length > 0 && (
                <View style={{ gap: space[2] }}>
                  <Text style={strong}>불리한 점</Text>
                  <ClaimLines items={report.unfavorable} onSeek={onSeek} />
                </View>
              )}
            </Card>
          )}
          {report.unseen.length > 0 && (
            <CautionCard title="영상만으로 확인할 수 없는 사실">
              <CautionText>{report.unseen.join(', ')}</CautionText>
            </CautionCard>
          )}
          <Footer text={DISCLAIMER} />
        </>
      )}

      {tab === 'basis' && (
        <>
          <DarkCard label="과실 판단 기준">
            <FaultHeadline fault={fault} note={noFault} confidence={report.confidence} collisionT={null} onSeek={undefined} />
            <Text style={[type.caption, { lineHeight: 19, color: color.brand400 }]}>{CONFIDENCE_MEANS}</Text>
          </DarkCard>
          {fault && <FaultProcess fault={fault} onSeek={seekToEvidence} />}
          {fault && <RangeWhy fault={fault} />}
          {fault && <ChartSource fault={fault} />}
          {/* 옛 레포트에는 laws/cases가 없을 수 있다 */}
          <RefCard title="관련 법규" items={(fault?.laws ?? []).map((l) => ({ text: `${l.name} ${l.article}(${l.title})`, url: l.url }))} />
          <RefCard
            title="참고 판례"
            items={(fault?.cases ?? []).map((c) => ({ text: `${c.court} ${c.date} ${c.number}`, url: isCaseUrl(c.url) ? c.url : '' }))}
            source={caseSource(fault?.cases ?? [])}
          />
          <SeriousViolations items={report.serious_violations} onSeek={seekToEvidence} />
          <Footer text={DISCLAIMER} />
        </>
      )}
    </View>
  );
}
