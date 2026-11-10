import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { color, space, type } from '@/theme';
import { Icon, type IconName } from './Icon';

// tone='brand'는 파란 바탕 위에 놓을 때 쓴다.
export function EmptyState({ icon, title, body, children, tone }: { icon: IconName; title: string; body?: string; children?: ReactNode; tone?: 'brand' }) {
  const onBrand = tone === 'brand';
  return (
    <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[8], paddingHorizontal: space[4] }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: onBrand ? 'rgba(255,255,255,0.16)' : color.brand200, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={24} color={onBrand ? color.onBrand : color.brand600} />
      </View>
      <Text style={[type.headline, { color: onBrand ? color.onBrand : color.gray12, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: onBrand ? color.brand200 : color.gray11, textAlign: 'center' }]}>{body}</Text> : null}
      {children ? <View style={{ marginTop: space[2], alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}
