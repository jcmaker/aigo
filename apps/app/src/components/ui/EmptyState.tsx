import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { color, space, type } from '@/theme';
import { Icon, type IconName } from './Icon';

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[8], paddingHorizontal: space[4] }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: color.brand200, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color={color.brand600} />
      </View>
      <Text style={[type.headline, { color: color.gray12, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: color.gray11, textAlign: 'center' }]}>{body}</Text> : null}
      {children ? <View style={{ marginTop: space[2], alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}
