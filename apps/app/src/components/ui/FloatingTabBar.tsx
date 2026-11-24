import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, Text, View } from 'react-native';
import { color, type } from '@/theme';
import { Icon, type IconName } from './Icon';

// 사고 현장 모드는 가장 급한 기능이라 가운데(3번째) 칸에 둔다(ADR 0029). 이름은 홈 카드·시작 화면 버튼과 같은 "사고 현장 모드".
// short: 아이콘 밑에 보이는 글자(ADR 0049). 칸이 좁아 "사고 현장 모드"는 "사고 현장"으로 줄이고, 읽기 문구(label)는 그대로 둔다.
export const TAB_ITEMS: { route: 'home' | 'analyses' | 'upload' | 'emergency' | 'account'; label: string; short: string; icon: IconName }[] = [
  { route: 'home', label: '홈', short: '홈', icon: 'home' },
  { route: 'analyses', label: '내 분석', short: '내 분석', icon: 'list' },
  { route: 'emergency', label: '사고 현장 모드', short: '사고 현장', icon: 'alert' },
  { route: 'upload', label: '분석하기', short: '분석하기', icon: 'video' },
  { route: 'account', label: '계정', short: '계정', icon: 'user' },
];

const CELL = 62; // 칸 너비
const CELL_H = 54; // 칸 높이(아이콘 + 글자)
const PAD = 7;

export function FloatingTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const x = useRef(new Animated.Value(state.index * CELL)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: state.index * CELL, useNativeDriver: true }).start();
  }, [state.index, x]);

  // 키보드가 열리면 숨긴다(사고 현장 모드 탭의 보험사 번호 입력이 가려지지 않게).
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboard) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 18, alignItems: 'center' }}>
      <View
        style={{
          flexDirection: 'row',
          padding: PAD,
          borderRadius: 999,
          backgroundColor: color.ink,
          opacity: 0.92,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Animated.View style={{ position: 'absolute', top: PAD, left: PAD, width: CELL, height: CELL_H, borderRadius: CELL_H / 2, backgroundColor: color.mint, transform: [{ translateX: x }] }} />
        {state.routes.map((route, i) => {
          const item = TAB_ITEMS.find((t) => t.route === route.name);
          if (!item) return null;
          const selected = state.index === i;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigateToTab(route.key);
          };
          const tint = selected ? color.ink : item.route === 'emergency' ? color.sceneIcon : color.white;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={onPress} style={{ width: CELL, height: CELL_H, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Icon name={item.icon} size={22} color={tint} />
              <Text style={[type.micro, { fontSize: 12, fontWeight: '700', color: tint }]} numberOfLines={1}>{item.short}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
