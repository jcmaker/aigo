import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { color, radius, space, type } from '@/theme';

// 숨은 입력칸 하나 위에 칸만 그린다
export function CodeInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: space[2] }} pointerEvents="none">
        {Array.from({ length }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 52, borderRadius: radius.icon, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center', borderWidth: focused && i === Math.min(value.length, length - 1) ? 2 : 1, borderColor: focused && i === Math.min(value.length, length - 1) ? color.brand : color.gray4 }}>
            <Text style={[type.title, { fontSize: 20, color: color.gray12 }]}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        accessibilityLabel="인증 코드"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        maxLength={length}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
      />
    </View>
  );
}
