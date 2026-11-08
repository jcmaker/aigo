import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, radius, space, type } from '@/theme';
import { Icon, type IconName } from './Icon';

// 화면 큰 제목(시안의 "영상 기록", "마이페이지" 자리)
export function PageTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space[1] }}>
      <Text accessibilityRole="header" style={[type.title, { color: color.gray12 }]}>{title}</Text>
      {right}
    </View>
  );
}

// 카드 밖 구역 제목. 오른쪽에 개수나 "전체 보기" 링크를 둔다.
export function SectionTitle({ title, meta, action }: { title: string; meta?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[2] }}>
      <Text accessibilityRole="header" style={[type.headline, { color: color.gray12 }]}>{title}</Text>
      {meta ? <Text style={[type.caption, { color: color.gray11 }]}>{meta}</Text> : null}
      {action ? (
        <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={[type.label, { color: color.brand600 }]}>{action.label}</Text>
          <Icon name="chevron" size={14} color={color.brand600} />
        </Pressable>
      ) : null}
    </View>
  );
}

// 연한 바탕의 네모 아이콘. danger는 현장 모드처럼 급한 기능에 쓴다.
export function IconTile({ name, danger, size = 44 }: { name: IconName; danger?: boolean; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.icon, backgroundColor: danger ? color.danger300 : color.brand200, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size * 0.45} color={danger ? color.danger : color.brand600} />
    </View>
  );
}

// 한 카드 안에 구분선으로 나뉜 메뉴 줄들
export function MenuGroup({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: color.white, borderRadius: radius.card, paddingHorizontal: space[4] }}>{children}</View>;
}

// danger: 제목까지 빨갛게(탈퇴). urgent: 아이콘만 빨갛게(현장 모드).
export function MenuRow({ icon, title, subtitle, onPress, danger, urgent, first }: {
  icon: IconName; title: string; subtitle?: string; onPress: () => void; danger?: boolean; urgent?: boolean; first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] + 2, borderTopWidth: first ? 0 : 1, borderTopColor: color.gray4 }}
    >
      <IconTile name={icon} danger={danger || urgent} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { fontSize: 14, color: danger ? color.danger600 : color.gray12 }]}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { fontSize: 12, color: color.gray11 }]}>{subtitle}</Text> : null}
      </View>
      <Icon name="chevron" size={16} color={color.gray9} />
    </Pressable>
  );
}
