import type { ReactElement, ReactNode, Ref } from 'react';
import { ScrollView, StatusBar, View, type RefreshControlProps, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, space, tabBarSpace } from '@/theme';

// 회색 바탕 화면 틀. 아래는 기기 안전 영역만큼, tabInset이면 떠 있는 메뉴만큼 더 비운다.
// 밝은 화면이라 상태 표시줄 글자를 어둡게 한다(진입 화면은 밝게 바꾼다).
export function Screen({ scroll, tabInset, children, style, refreshControl, scrollRef }: { scroll?: boolean; tabInset?: boolean; children: ReactNode; style?: StyleProp<ViewStyle>; refreshControl?: ReactElement<RefreshControlProps>; scrollRef?: Ref<ScrollViewInstance> }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingHorizontal: space[4], paddingBottom: space[4] + insets.bottom + (tabInset ? tabBarSpace : 0), gap: space[3] };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      {scroll ? (
        <ScrollView ref={scrollRef} contentContainerStyle={[pad, style]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
