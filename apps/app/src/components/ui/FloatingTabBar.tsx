import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, View } from 'react-native';
import { color } from '@/theme';
import { Icon, type IconName } from './Icon';

export const TAB_ITEMS: { route: 'home' | 'analyses' | 'upload' | 'emergency' | 'account'; label: string; icon: IconName }[] = [
  { route: 'home', label: '홈', icon: 'home' },
  { route: 'analyses', label: '내 분석', icon: 'list' },
  { route: 'upload', label: '분석하기', icon: 'video' },
  { route: 'emergency', label: '현장 모드', icon: 'alert' },
  { route: 'account', label: '계정', icon: 'user' },
];

const CELL = 46;
const PAD = 7;

export function FloatingTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const x = useRef(new Animated.Value(state.index * CELL)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: state.index * CELL, useNativeDriver: true }).start();
  }, [state.index, x]);

  // 키보드가 열리면 숨긴다(현장 모드 탭의 보험사 번호 입력이 가려지지 않게).
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
        <Animated.View style={{ position: 'absolute', top: PAD, left: PAD, width: CELL, height: CELL, borderRadius: CELL / 2, backgroundColor: color.brand, transform: [{ translateX: x }] }} />
        {state.routes.map((route, i) => {
          const item = TAB_ITEMS.find((t) => t.route === route.name);
          if (!item) return null;
          const selected = state.index === i;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigateToTab(route.key);
          };
          const tint = selected ? color.onBrand : item.route === 'emergency' ? color.sceneIcon : color.white;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={onPress} style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={item.icon} size={22} color={tint} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
