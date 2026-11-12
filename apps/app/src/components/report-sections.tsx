// 사고 분석 리포트 화면의 조각들(ADR 0027). 데이터는 서버 Report를 그대로 쓰고, 화면에서 새 사실을 만들지 않는다.
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { LEVEL, LIKELIHOOD, faultRange, formatTimePrecise, signed, type Evidence, type FaultAssessment, type Report } from '@/lib/analysis';
import { Card, Icon, ListRow, TimeChip, type IconName } from '@/components/ui';
import { color, radius, space, type } from '@/theme';

export type Seek = ((t: number) => void) | undefined;

const body = [type.body, { lineHeight: 22, color: color.gray12 }];
const muted = [type.caption, { lineHeight: 19, color: color.gray11 }];
const strong = [type.label, { fontSize: 14, color: color.gray12 }];
const onDark = { color: color.white } as const;
const onDarkMuted = { color: color.brand400 } as const;

/** 남청색 강조 카드 */
export function DarkCard({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <View style={{ backgroundColor: color.ink, borderRadius: radius.card, padding: space[5], gap: space[3] }}>
      {label ? <Text style={[type.micro, { color: color.mint, letterSpacing: 1.5, fontWeight: '800' }]}>{label}</Text> : null}
      {children}
    </View>
  );
}

/** 확인되지 않은 정보용 노란 안내 카드 */
export function CautionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View accessible accessibilityLabel={`${title}`} style={{ backgroundColor: color.warning300, borderRadius: radius.row, padding: space[4], gap: space[2] }}>
      <Text style={[type.label, { fontSize: 14, color: '#8A4A0B' }]}>{title}</Text>
      {children}
    </View>
  );
}

export function CautionText({ children }: { children: ReactNode }) {
  return <Text style={[type.caption, { lineHeight: 19, color: '#7A4A0A' }]}>{children}</Text>;
}

/** 작은 상태 칩 */
export function Pill({ text, tone = 'mint' }: { text: string; tone?: 'mint' | 'amber' | 'gray' | 'red' }) {
  const look = {
    mint: { bg: color.mintSoft, fg: color.mintDeep },
    amber: { bg: '#5A3B10', fg: '#FFD28A' },
    gray: { bg: color.gray3, fg: color.gray11 },
    red: { bg: color.danger300, fg: color.danger600 },
  }[tone];
  return (
    <Text style={[type.micro, { fontWeight: '800', color: look.fg, backgroundColor: look.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden', alignSelf: 'flex-start' }]}>{text}</Text>
  );
}

/** 카드 안의 "… 보기 →" 이동 글자 */
// 남색 카드 안(dark)에서는 밝은 민트, 흰 카드에서는 진한 민트를 써서 대비 4.5:1 이상을 지킨다.
export function LinkRow({ label, onPress, dark = false }: { label: string; onPress: () => void; dark?: boolean }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={[type.label, { fontSize: 14, color: dark ? color.mint : color.mintDeep }]}>{label} →</Text>
    </Pressable>
  );
}

/** 번호 목록. 누를 수 있는 기능이 없으므로 화살표를 그리지 않는다. */
export function NumberedList({ items }: { items: string[] }) {
  return (
    <View style={{ gap: space[2] }}>
      {items.map((item, i) => (
        <View key={item} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type.label, { color: color.mintDeep }]}>{i + 1}</Text>
          </View>
          <Text style={[body, { flex: 1, paddingTop: 3 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** 점 목록 */
export function DotList({ items, tone = 'mint' }: { items: string[]; tone?: 'mint' | 'gray' }) {
  return (
    <View style={{ gap: space[2] }}>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 8, backgroundColor: tone === 'mint' ? color.mintDeep : color.gray9 }} />
          <Text style={[body, { flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** 시각이 붙은 사실 한 줄: 시각 칩(누르면 이동) + 문장 */
export function EvidenceLine({ e, onSeek, tone = 'mint' }: { e: Evidence; onSeek: Seek; tone?: 'mint' | 'brand' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
      <TimeChip seconds={e.t} onPress={onSeek} tone={tone} />
      <Text style={[body, { flex: 1 }]}>{e.text}</Text>
    </View>
  );
}

const isCollision = (t: number, collision: number | null) => collision !== null && Math.abs(t - collision) < 0.05;

/** 세로 연결형 타임라인. 서버가 준 충돌 시각과 같은 항목만 "접촉 장면"으로 강조한다. */
export function VerticalTimeline({ items, collisionT, onSeek }: { items: Evidence[]; collisionT: number | null; onSeek: Seek }) {
  return (
    <View>
      {items.map((e, i) => {
        const hit = isCollision(e.t, collisionT);
        const last = i === items.length - 1;
        const dot = hit ? color.danger : color.mint;
        const t = formatTimePrecise(e.t);
        const row = (
          <View style={{ flexDirection: 'row', gap: space[3], minHeight: 44 }}>
            <View style={{ width: 16, alignItems: 'center' }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot, marginTop: 5 }} />
              {!last && <View style={{ flex: 1, width: 2, backgroundColor: color.gray4, marginTop: 4 }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : space[4], gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Text style={[type.label, { color: hit ? color.danger600 : color.mintDeep }]}>{t}</Text>
                {hit && <Pill text="접촉 장면" tone="red" />}
              </View>
              <Text style={[strong, { fontSize: 15, lineHeight: 22 }]}>{e.text}</Text>
              {onSeek && <Text style={muted}>눌러서 이 장면으로 이동</Text>}
            </View>
          </View>
        );
        return onSeek ? (
          <Pressable key={`${e.t}-${e.text}`} accessibilityRole="button" accessibilityLabel={`${t} ${e.text}, 장면으로 이동`} onPress={() => onSeek(e.t)}>
            {row}
          </Pressable>
        ) : (
          <View key={`${e.t}-${e.text}`} accessible accessibilityLabel={`${t} ${e.text}`}>
            {row}
          </View>
        );
      })}
    </View>
  );
}

/** 파이프라인이 문장 끝에 붙인 "(7.8초)"를 눌러서 이동하는 시각으로 바꾼다. 분류(유리·불리)는 서버 값을 그대로 둔다. */
export function splitClaim(claim: string): { text: string; t: number | null } {
  const m = claim.match(/^(.*?)\s*\((\d+(?:\.\d+)?)초\)$/);
  return m ? { text: m[1], t: Number(m[2]) } : { text: claim, t: null };
}

export function ClaimLines({ items, onSeek }: { items: string[]; onSeek: Seek }) {
  return (
    <View style={{ gap: space[2] }}>
      {items.map((claim) => {
        const { text, t } = splitClaim(claim);
        return t === null ? (
          <DotList key={claim} items={[text]} />
        ) : (
          <EvidenceLine key={claim} e={{ t, text }} onSeek={onSeek} />
        );
      })}
    </View>
  );
}

/** 과실 참고 범위를 크게. fault가 없으면 산정 불가 사유를 보인다. */
export function FaultHeadline({ fault, note, confidence, collisionT, onSeek, onBasis }: {
  fault: FaultAssessment | null; note: string | null; confidence: Report['confidence']; collisionT: number | null; onSeek: Seek; onBasis?: () => void;
}) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Text style={[type.body, onDarkMuted]}>내 과실 예상</Text>
        <Pill text={fault ? 'AI 추정 · 확정 아님' : '산정 불가'} tone="amber" />
      </View>
      {fault ? (
        <Text accessibilityLabel={`예상 범위 ${faultRange(fault)}`} style={[type.display, { fontSize: 40, color: color.mint }]}>{faultRange(fault)}</Text>
      ) : (
        <Text style={[type.headline, onDark]}>{note ?? '영상만으로는 과실 참고 범위를 산정하지 못했습니다.'}</Text>
      )}
      <Text style={[type.caption, { lineHeight: 19 }, onDarkMuted]}>
        {fault ? '기준 도표와 영상 근거를 바탕으로 제시한 참고 범위입니다. ' : ''}근거 확인 정도: {LEVEL[confidence]}
        {confidence === 'low' ? ' · 근거 확인 필요' : ''}
      </Text>
      {fault && (
        <Text accessibilityLabel={`기준 도표 ${fault.chart_id}`} style={[type.caption, onDarkMuted]} numberOfLines={1}>
          기준 도표 {fault.chart_id} · {fault.chart_title}
        </Text>
      )}
      {collisionT !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text style={[type.caption, onDarkMuted]}>충돌 의심 시각</Text>
          <TimeChip seconds={collisionT} onPress={onSeek} tone="mint" />
        </View>
      )}
      {fault && onBasis && <LinkRow dark label="예상 범위의 근거 보기" onPress={onBasis} />}
    </>
  );
}

/** 기준 탭: 범위가 나온 과정 */
export function FaultProcess({ fault, onSeek }: { fault: FaultAssessment; onSeek: Seek }) {
  const point = fault.base + fault.steps.reduce((sum, s) => sum + s.delta, 0);
  const chart = `${fault.chart_title} · ${fault.chart_id}`;
  return (
    <Card title="범위가 나온 과정">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Text style={strong}>기준 도표의 기본과실</Text>
          <Text style={muted}>{chart}</Text>
        </View>
        <Text style={[type.title, { color: color.gray12 }]}>{fault.base}%</Text>
      </View>
      {fault.steps.map((s) => (
        <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], borderTopWidth: 1, borderTopColor: color.gray4, paddingTop: space[3] }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={strong}>{s.label}</Text>
            <EvidenceLine e={s.evidence} onSeek={onSeek} />
          </View>
          <Text style={[type.title, { color: s.delta < 0 ? color.mintDeep : color.gray12 }]}>{signed(s.delta)}</Text>
        </View>
      ))}
      {fault.steps.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: color.gray4, paddingTop: space[3] }}>
          <Text style={muted}>확인된 수정요소를 반영한 값</Text>
          <Text style={[type.headline, { color: color.gray12 }]}>{point}%</Text>
        </View>
      )}
      <View style={{ backgroundColor: color.mintSoft, borderRadius: radius.row, padding: space[4], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.micro, { color: color.mintDeep }]}>{fault.unknown.length > 0 ? '미확인 조건을 반영한' : '최종'}</Text>
          <Text style={[type.label, { fontSize: 15, color: color.gray12 }]}>내 과실 예상</Text>
        </View>
        <Text style={[type.title, { fontSize: 28, color: color.gray12 }]}>{faultRange(fault)}</Text>
      </View>
    </Card>
  );
}

/** 왜 하나의 숫자가 아닌지. 서버는 미확인 조건의 이름만 주므로 폭은 설명하지 않는다. */
export function RangeWhy({ fault }: { fault: FaultAssessment }) {
  if (fault.my_min === fault.my_max) return null;
  const names = fault.unknown.join(', ');
  return (
    <CautionCard title="왜 하나의 숫자가 아닌가요?">
      {fault.unknown.length > 0 ? (
        <CautionText>{names}을(를) 영상으로 확인할 수 없어, 이 조건이 적용될 때의 영향만큼 범위를 넓혔습니다. 조건별로 범위에 미친 폭은 추가 계산 근거 확인이 필요합니다.</CautionText>
      ) : (
        <CautionText>영상으로 확인하지 못한 조건은 없지만 범위로 제시됐습니다. 추가 계산 근거 확인이 필요합니다.</CautionText>
      )}
    </CautionCard>
  );
}

const isHttp = (u: string) => /^https?:\/\//i.test(u);
const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => {});

/** 기준 도표와 출처. 검증된 주소가 있을 때만 연결한다. */
export function ChartSource({ fault }: { fault: FaultAssessment }) {
  return (
    <Card title="기준과 출처">
      <DotList items={[`${fault.chart_title} 기준 도표 · ${fault.chart_id}`, `이 도표에서 내 차는 ${fault.me}입니다.`]} tone="gray" />
      {isHttp(fault.source_url) ? (
        <ListRow title="출처: 과실비율정보포털" subtitle={fault.source_url} trailing={<Icon name="chevron" size={16} color={color.gray11} />} onPress={() => open(fault.source_url)} />
      ) : (
        <Text style={muted}>출처 확인 필요: 검증된 출처 주소가 없어 연결하지 않습니다.</Text>
      )}
      <Text style={muted}>법적 판단이 확정된 기준이 아니라 참고용 도표입니다.</Text>
    </Card>
  );
}

const PARTY = { me: '내 차', other: '상대 차', unknown: '' } as const;

/** 중대한 위반 여부: 영상에서 확인된 장면 / 가능성이 제시된 항목 / 영상으로 확인할 수 없는 항목 */
export function SeriousViolations({ items, onSeek }: { items: Report['serious_violations']; onSeek: Seek }) {
  if (items.length === 0) return null;
  const seen = items.filter((v) => v.evidence);
  const suggested = items.filter((v) => !v.evidence && v.likelihood !== 'unknown');
  const unknown = items.filter((v) => !v.evidence && v.likelihood === 'unknown');
  const name = (v: Report['serious_violations'][number]) => [PARTY[v.party ?? 'unknown'], v.item].filter(Boolean).join(' · ');
  return (
    <Card title="중대한 위반 여부">
      <Text style={muted}>AI가 위반을 확정한 것이 아니라, 영상에서 관련 장면이 보였는지만 정리했습니다.</Text>
      {seen.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Text style={strong}>영상에서 확인된 장면</Text>
          {seen.map((v) => (
            <View key={v.item} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                <Pill text={LIKELIHOOD[v.likelihood]} tone={v.likelihood === 'high' ? 'red' : 'mint'} />
                <Text style={strong}>{name(v)}</Text>
              </View>
              {v.evidence && <EvidenceLine e={v.evidence} onSeek={onSeek} />}
            </View>
          ))}
        </View>
      )}
      {suggested.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Text style={strong}>가능성이 제시된 항목</Text>
          {suggested.map((v) => (
            <View key={v.item} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
              <Pill text={LIKELIHOOD[v.likelihood]} tone={v.likelihood === 'high' ? 'red' : v.likelihood === 'low' ? 'gray' : 'mint'} />
              <Text style={strong}>{name(v)}</Text>
            </View>
          ))}
        </View>
      )}
      {unknown.length > 0 && (
        <View style={{ gap: space[2] }}>
          <Text style={strong}>영상으로 확인할 수 없는 항목</Text>
          <DotList items={unknown.map((v) => `${name(v)} 여부는 영상에서 확인할 수 없음`)} tone="gray" />
        </View>
      )}
    </Card>
  );
}

/** 리포트 맨 아래 고정 문구 */
export function Footer({ text }: { text: string }) {
  return (
    <View accessible accessibilityLabel={`주의 ${text}`} style={{ paddingVertical: space[2] }}>
      <Text style={[type.caption, { textAlign: 'center', color: color.gray11 }]}>{text}</Text>
    </View>
  );
}

// 리포트 화면 머리글(ADR 0027): 남색 직각 상자, 제목·날짜는 화면 가운데에 둔다. 바로 아래에 흰 탭 줄(ReportTabs)이 붙는다.
// 뒤로·공유 버튼은 양옆에 같은 너비로 두어 가운데 줄이 한쪽으로 밀리지 않게 한다.
const SIDE = 38;
export const headerCircle = { width: SIDE, height: SIDE, borderRadius: SIDE / 2, backgroundColor: color.ink2, alignItems: 'center', justifyContent: 'center' } as const;

export function ReportHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={{ backgroundColor: color.ink, marginHorizontal: -space[4], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4], flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} style={headerCircle}>
        <Icon name="back" size={18} color={color.white} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
        <Text accessibilityRole="header" style={[type.title, { color: color.white, fontSize: 20, textAlign: 'center' }]} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { color: color.brand400, textAlign: 'center' }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ?? <View style={{ width: SIDE }} />}
    </View>
  );
}

// 리포트 탭(ADR 0027): 흰 바탕, 같은 너비 세 칸, 선택 탭은 굵은 남색 글씨와 아래 민트 막대.
// 남색 머리글 바로 아래에 붙도록 위 간격을 지우고, 아래 구분선으로 본문과 나눈다.
const TAB_H = 48;
export function ReportTabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: color.white, marginHorizontal: -space[4], marginTop: -space[3], borderBottomWidth: 1, borderBottomColor: color.tabLine }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: TAB_H, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? color.ink : color.tabInactive }}
            >
              {o.label}
            </Text>
            {on && <View style={{ position: 'absolute', left: space[4], right: space[4], bottom: -1, height: 3, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: color.mint }} />}
          </Pressable>
        );
      })}
    </View>
  );
}

// 리포트 머리글 오른쪽 "더 보기" 메뉴(ADR 0027): ⋯ 버튼 바로 아래에 작은 상자로 뜬다(안드로이드 기본 메뉴 방식).
// 바깥을 누르거나 뒤로 가기를 누르면 닫힌다. anchor는 ⋯ 버튼의 화면 위치(measureInWindow)다.
export type MenuAction = { label: string; icon: IconName; onPress: () => void; danger?: boolean; disabled?: boolean };
export type MenuAnchor = { top: number; right: number };
const MENU_W = 228;
export function ReportMenu({ visible, actions, anchor, onClose }: { visible: boolean; actions: MenuAction[]; anchor: MenuAnchor | null; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="메뉴 닫기" onPress={onClose} style={{ flex: 1 }}>
        <View
          accessibilityRole="menu"
          onStartShouldSetResponder={() => true}
          style={{
            position: 'absolute', top: anchor?.top ?? 56, right: anchor?.right ?? space[4], width: MENU_W,
            backgroundColor: color.white, borderRadius: radius.input, paddingVertical: space[1],
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
          }}
        >
          {actions.map((a, i) => {
            const fg = a.danger ? color.danger600 : color.gray12;
            return (
              <Pressable
                key={a.label}
                accessibilityRole="menuitem"
                accessibilityLabel={a.label}
                accessibilityState={{ disabled: !!a.disabled }}
                disabled={a.disabled}
                onPress={() => { onClose(); a.onPress(); }}
                style={({ pressed }) => ({
                  minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4],
                  backgroundColor: pressed ? color.gray3 : 'transparent', opacity: a.disabled ? 0.4 : 1,
                  // 삭제처럼 위험한 항목은 위 항목들과 얇은 선으로 나눈다.
                  borderTopWidth: a.danger && i > 0 ? 1 : 0, borderTopColor: color.gray4,
                })}
              >
                <Icon name={a.icon} size={18} color={fg} />
                <Text style={[type.body, { fontWeight: '600', color: fg }]} numberOfLines={1}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}
