import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { color, radius, space, type } from '@/theme';

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const warn = tone === 'warn';
  return (
    <View style={{ borderRadius: radius.input, padding: space[3], backgroundColor: warn ? color.warning300 : color.white, borderWidth: warn ? 0 : 1, borderColor: color.gray4 }}>
      <Text style={[type.caption, { fontSize: 12.5, lineHeight: 19, color: warn ? '#7A4A0A' : color.gray11 }]}>{children}</Text>
    </View>
  );
}
