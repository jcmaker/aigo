import { useRouter } from 'expo-router';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Icon, SourceChip, StatusChip, statusTone, type IconName } from '@/components/ui';
import { STATUS_LABEL, analysisTitle, faultRange, seoulDate, type Analysis } from '@/lib/analysis';
import { color, radius, space, type } from '@/theme';

// 내 분석 목록과 홈이 같이 쓰는 분석 카드(ADR 0032). 리포트 화면과 같은 남색·민트 색감.
// 왼쪽: 상태 아이콘, 가운데: 사고 유형·상태·날짜, 오른쪽: 내 과실 범위(가장 궁금한 값이라 크게).
// 삭제는 길게 눌러서 한다(리포트 화면 ⋯ 메뉴에도 있다). 줄마다 휴지통을 두면 열려다 잘못 누르기 쉽다.
const LOOK: Record<string, { icon: IconName; bg: string; fg: string }> = {
  good: { icon: 'file', bg: color.mintSoft, fg: color.mintDeep },
  warn: { icon: 'video', bg: color.warning300, fg: color.warning600 },
  bad: { icon: 'alert', bg: color.danger300, fg: color.danger600 },
  neutral: { icon: 'video', bg: color.gray3, fg: color.gray11 },
};

// select: 여러 개 지우기 모드에서 왼쪽에 체크 동그라미를 보인다. disabled면 고를 수 없다(분석 중).
export function AnalysisRow({ a, onPress, onDelete, select }: { a: Analysis; onPress: () => void; onDelete?: () => void; select?: { checked: boolean; disabled: boolean } }) {
  // 아직 결과가 없는 상태는 "분석 #13" 대신 지금 무슨 일이 있는지 말해 준다.
  const title = a.status === 'queued' || a.status === 'processing' ? '영상을 분석하고 있어요' : a.status === 'created' ? '영상 업로드가 끝나지 않았어요' : analysisTitle(a);
  // 좁은 화면(360 미만)에서는 과실 범위를 오른쪽 칸 대신 상태 줄 아래에 둬서 제목이 잘게 끊기지 않게 한다.
  const narrow = useWindowDimensions().width < 360;
  const tone = statusTone(a.status);
  const look = LOOK[tone];
  const status = STATUS_LABEL[a.status] ?? STATUS_LABEL.processing;
  const date = seoulDate(a.created_at);
  const range = a.report?.fault ? faultRange(a.report.fault) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, status, range ? `내 과실 ${range}` : null, date, a.source === 'dashpi' ? 'DashPi' : null].filter(Boolean).join(', ')}
      accessibilityHint={select ? (select.disabled ? '분석 중이라 고를 수 없어요' : undefined) : onDelete ? '길게 누르면 삭제할 수 있어요' : undefined}
      accessibilityState={select ? { checked: select.checked, disabled: select.disabled } : undefined}
      disabled={select?.disabled}
      onPress={onPress}
      onLongPress={select ? undefined : onDelete}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], backgroundColor: select?.checked ? color.mintSoft : pressed ? color.gray2 : color.white, borderRadius: radius.row, borderWidth: select?.checked ? 2 : 1, borderColor: select?.checked ? color.mintDeep : color.line, opacity: select?.disabled ? 0.45 : 1 })}
    >
      {select ? (
        <View style={{ width: 28, height: 28, borderRadius: 14, marginHorizontal: 8, borderWidth: 2, borderColor: select.checked ? color.mintDeep : color.gray9, backgroundColor: select.checked ? color.mintDeep : color.white, alignItems: 'center', justifyContent: 'center' }}>
          {select.checked ? <Icon name="check" size={16} color={color.white} /> : null}
        </View>
      ) : (
        // 고르는 중에는 체크 동그라미가 상태 아이콘 자리를 대신해 제목이 좁아지지 않게 한다.
        <View style={{ width: 44, height: 44, borderRadius: radius.icon, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={look.icon} size={20} color={look.fg} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.body, { fontSize: 16, fontWeight: '700', color: color.gray12 }]} numberOfLines={2}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <StatusChip tone={tone} label={status} />
          <Text style={[type.caption, { color: color.gray11 }]}>{date}</Text>
          <SourceChip source={a.source} />
        </View>
        {range && narrow ? (
          <Text style={[type.label, { fontSize: 15, color: color.gray11 }]}>
            내 과실 <Text style={{ fontSize: 17, fontWeight: '800', color: color.mintDeep }}>{range}</Text>
          </Text>
        ) : null}
      </View>
      {range && !narrow ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.micro, { color: color.gray11 }]}>내 과실</Text>
          <Text style={[type.headline, { fontSize: 18, fontWeight: '800', color: color.mintDeep }]}>{range}</Text>
        </View>
      ) : null}
      {select ? null : <Icon name="chevron" size={16} color={color.gray11} />}
    </Pressable>
  );
}

// 홈 "최근 분석"(ADR 0048): 제목 줄 없이 한 줄짜리 띠로 줄여 홈 맨 위에 붙인다. 전체 목록은 하단 메뉴 내 분석.
export function RecentStrip({ a }: { a: Analysis }) {
  const router = useRouter();
  const busy = a.status === 'queued' || a.status === 'processing';
  const title = busy ? '영상을 분석하고 있어요' : a.status === 'created' ? '영상 업로드가 끝나지 않았어요' : analysisTitle(a);
  const tone = statusTone(a.status);
  const look = LOOK[tone];
  const range = a.report?.fault ? faultRange(a.report.fault) : null;
  const status = STATUS_LABEL[a.status] ?? STATUS_LABEL.processing;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={['최근 분석', title, status, range ? `내 과실 ${range}` : null].filter(Boolean).join(', ')}
      onPress={() => router.push(`/analyses/${a.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], paddingHorizontal: space[3], backgroundColor: pressed ? color.gray2 : color.white, borderRadius: radius.row, borderWidth: 1, borderColor: color.line })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={look.icon} size={18} color={look.fg} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.caption, { color: color.gray11 }]}>최근 분석 · {seoulDate(a.created_at)}</Text>
        <Text style={[type.body, { fontSize: 15, fontWeight: '700', color: color.gray12 }]} numberOfLines={1}>{title}</Text>
      </View>
      {range ? (
        <Text style={[type.headline, { fontSize: 17, fontWeight: '800', color: color.mintDeep }]}>{range}</Text>
      ) : (
        <StatusChip tone={tone} label={status} />
      )}
      <Icon name="chevron" size={16} color={color.gray11} />
    </Pressable>
  );
}
