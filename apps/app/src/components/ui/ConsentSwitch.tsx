import { Pressable, Text, View } from 'react-native';
import { color, type } from '@/theme';

export function ConsentSwitch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: value ? color.brand : '#C9C9C9', alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color.white }} />
      </View>
      <Text style={[type.label, { flex: 1, color: color.gray12 }]}>{label}</Text>
    </Pressable>
  );
}
