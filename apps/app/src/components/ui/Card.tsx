import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, radius, space, type } from '@/theme';

export function Card({ title, action, children }: { title?: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: color.white, borderRadius: radius.card, padding: space[4], gap: space[3] }}>
      {(title || action) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={[type.headline, { color: color.gray12 }]}>{title}</Text>
          {action && (
            <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={8}>
              <Text style={[type.label, { color: color.brand600 }]}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}
