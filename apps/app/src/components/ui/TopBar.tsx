import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, space, type } from '@/theme';
import { Icon } from './Icon';

// 흰 원형 버튼 38
const circle = { width: 38, height: 38, borderRadius: 19, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' } as const;

export function TopBar({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[1] }}>
      {onBack && (
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} style={circle}>
          <Icon name="back" size={18} color={color.ink} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={[type.headline, { color: color.gray12 }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { color: color.gray11 }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// 오른쪽 동작용 흰 원형 버튼 틀
export const circleButtonStyle = circle;
