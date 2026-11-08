import { Pressable, Text, View } from 'react-native';
import { color, radius, space, type } from '@/theme';

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: color.white, borderRadius: radius.pill, padding: space[1] }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill }, on && { backgroundColor: color.gray3 }]}
          >
            <Text style={[type.label, { color: on ? color.ink : color.gray11, fontWeight: on ? '700' : '600' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
