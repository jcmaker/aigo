import { Text, View } from 'react-native';
import { color, radius, space, type } from '@/theme';

export function StatTile({ label, value, unit, tone = 'light', valueColor }: { label: string; value: string | number; unit?: string; tone?: 'light' | 'dark'; valueColor?: string }) {
  const dark = tone === 'dark';
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}${unit ?? ''}`}
      style={{
        flex: 1, alignItems: 'center', padding: space[3], borderRadius: radius.row, borderWidth: 1,
        backgroundColor: dark ? color.ink2 : color.gray2, borderColor: dark ? color.ink3 : color.gray4,
      }}
    >
      <Text style={[type.micro, { color: dark ? '#A0A0A0' : color.gray11 }]}>{label}</Text>
      <Text style={[type.title, { marginTop: space[1], color: valueColor ?? (dark ? color.white : color.gray12) }]}>
        {value}
        {unit ? <Text style={[type.caption, { color: color.gray9 }]}>{unit}</Text> : null}
      </Text>
    </View>
  );
}
