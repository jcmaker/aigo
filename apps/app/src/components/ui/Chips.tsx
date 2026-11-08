import { Pressable, Text } from 'react-native';
import { formatTime } from '@/lib/analysis';
import { color, radius, space, type } from '@/theme';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const tones: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: color.brand200, fg: color.brand600 },
  warn: { bg: color.warning300, fg: color.warning600 },
  bad: { bg: color.danger300, fg: color.danger600 },
  neutral: { bg: color.gray3, fg: color.gray11 },
};

export function statusTone(status: string): Tone {
  if (status === 'done') return 'good';
  if (status === 'queued' || status === 'processing') return 'warn';
  if (status === 'failed') return 'bad';
  return 'neutral';
}

export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  const { bg, fg } = tones[tone];
  return (
    <Text style={[type.micro, { fontWeight: '700', color: fg, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden', alignSelf: 'flex-start' }]}>
      {label}
    </Text>
  );
}

// DashPi 블랙박스가 올린 분석에만 붙는 출처 칩
export function SourceChip({ source }: { source: string }) {
  return source === 'dashpi' ? <StatusChip tone="neutral" label="DashPi" /> : null;
}

// onPress가 없으면(재생 영상 없음) 버튼이 아닌 글자로 그린다
export function TimeChip({ seconds, onPress }: { seconds: number; onPress?: (seconds: number) => void }) {
  const t = formatTime(seconds);
  const style = [type.micro, { fontSize: 12, fontWeight: '800', color: color.brand600, backgroundColor: color.brand200, borderRadius: 8, paddingHorizontal: 9, paddingVertical: space[1], overflow: 'hidden' }] as const;
  if (!onPress) return <Text style={style}>{t}</Text>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${t} 장면으로 이동`} onPress={() => onPress(seconds)} hitSlop={8}>
      <Text style={style}>{t}</Text>
    </Pressable>
  );
}
