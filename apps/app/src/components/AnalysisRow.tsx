import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Icon, SectionTitle, SourceChip, StatusChip, statusTone } from '@/components/ui';
import { STATUS_LABEL, analysisTitle, faultRange, seoulDate, type Analysis } from '@/lib/analysis';
import { color, radius, space, type } from '@/theme';

// 내 분석 목록과 홈이 같이 쓰는 분석 카드(시안의 recent-card 배치: 썸네일 칸, 제목, 날짜, 상태 칩, 화살표)
export function AnalysisRow({ a, onPress, onDelete }: { a: Analysis; onPress: () => void; onDelete?: () => void }) {
  const title = analysisTitle(a);
  const sub = `#${a.id} · ${seoulDate(a.created_at)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], backgroundColor: color.white, borderRadius: radius.row, borderWidth: 1, borderColor: color.gray4 }}
    >
      <View style={{ width: 72, height: 56, borderRadius: radius.icon, backgroundColor: color.gray3, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="video" size={22} color={color.gray9} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.label, { fontSize: 14, color: color.gray12 }]} numberOfLines={2}>{title}</Text>
        <Text style={[type.caption, { fontSize: 12, color: color.gray11 }]}>{sub}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <SourceChip source={a.source} />
          <StatusChip tone={statusTone(a.status)} label={STATUS_LABEL[a.status] ?? STATUS_LABEL.processing} />
          {a.report?.fault ? <Text style={[type.micro, { color: color.gray11 }]}>내 과실 {faultRange(a.report.fault)}</Text> : null}
        </View>
      </View>
      {onDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`분석 #${a.id} 삭제`} onPress={onDelete} hitSlop={10}>
          <Icon name="trash" size={18} color={color.gray9} />
        </Pressable>
      ) : (
        <Icon name="chevron" size={16} color={color.gray9} />
      )}
    </Pressable>
  );
}

export function RecentAnalyses({ items }: { items: Analysis[] }) {
  const router = useRouter();
  return (
    <>
      <SectionTitle title="최근 분석 기록" action={{ label: '전체 보기', onPress: () => router.push('/analyses') }} />
      {items.slice(0, 3).map((a) => (
        <AnalysisRow key={a.id} a={a} onPress={() => router.push(`/analyses/${a.id}`)} />
      ))}
    </>
  );
}
