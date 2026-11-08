import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, radius, space, type } from '@/theme';

export function TextField({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[type.label, { fontSize: 12, color: color.gray11 }]}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.gray9}
        style={[
          type.body,
          { height: 52, borderRadius: radius.input, paddingHorizontal: space[4], color: color.gray12, backgroundColor: error ? color.danger300 : color.white, borderWidth: error ? 1.5 : 1, borderColor: error ? color.danger : color.gray4 },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={[type.caption, { fontSize: 12, color: color.danger600 }]}>{error}</Text> : null}
    </View>
  );
}
