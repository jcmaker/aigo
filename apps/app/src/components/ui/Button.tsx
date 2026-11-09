import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { color, radius, space, type } from '@/theme';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'danger' | 'emergency';

const look: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.brand, fg: color.onBrand },
  secondary: { bg: color.white, fg: color.ink, border: color.gray4 },
  dark: { bg: color.ink, fg: color.white },
  danger: { bg: color.danger300, fg: color.danger600 },
  emergency: { bg: color.danger, fg: color.white },
};

export function Button({ label, onPress, variant = 'primary', size = 'lg', icon, disabled, loading, style }: {
  label: string; onPress: () => void; variant?: ButtonVariant; size?: 'lg' | 'md'; icon?: IconName;
  disabled?: boolean; loading?: boolean;
  style?: StyleProp<ViewStyle>; // 바깥 틀용(flex 등)
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const off = disabled || loading;
  const { bg, fg, border } = look[variant];
  const dis = disabled; // 비활성은 회색, 로딩은 원래 색 유지
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!off, busy: !!loading }}
        disabled={off}
        onPress={onPress}
        onPressIn={() => spring(0.97)}
        onPressOut={() => spring(1)}
        style={{
          height: size === 'lg' ? 52 : 42, borderRadius: radius.pill, paddingHorizontal: space[5],
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          backgroundColor: dis ? color.gray4 : bg, borderWidth: border && !dis ? 1 : 0, borderColor: border,
        }}
      >
        {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={dis ? color.gray9 : fg} /> : null}
        <Text style={[type.headline, { fontSize: size === 'lg' ? 15 : 13.5, color: dis ? color.gray9 : fg }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
