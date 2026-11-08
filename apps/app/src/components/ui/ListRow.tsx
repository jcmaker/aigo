import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, radius, space, type } from '@/theme';

export function ListRow({ leading, title, subtitle, trailing, onPress, danger }: {
  leading?: ReactNode; title: string; subtitle?: string; trailing?: ReactNode; onPress?: () => void; danger?: boolean;
}) {
  const body = (
    <>
      {leading ? <View style={{ minWidth: 40, minHeight: 40, borderRadius: radius.icon, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{leading}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { fontSize: 14, color: danger ? color.danger600 : color.gray12 }]}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { fontSize: 12, color: color.gray11 }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </>
  );
  const style = { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderWidth: 1, borderColor: color.gray4, borderRadius: radius.row, backgroundColor: color.white } as const;
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} onPress={onPress} style={style}>{body}</Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}
