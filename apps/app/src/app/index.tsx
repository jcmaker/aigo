import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { getSharedPayloads } from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { Splash } from '@/components/ui/Splash';
import { color, space } from '@/theme';

// `/`는 로그인 여부와 상관없이 열려야 한다. 그룹 안에 두면 로그아웃 상태 첫 화면이 Unmatched Route가 된다.
// Clerk가 로드되기 전(오프라인이면 끝내 로드되지 않을 수 있다)에도 사고 현장 모드로 들어갈 수 있어야 한다.
// 진입 모션은 앱을 새로 시작할 때 한 번만 보인다. 로그인·로그아웃, SSO 복귀, 공유 화면 "처음으로"로 index가 다시 마운트되면 건너뛴다.
// 사고 현장 모드 버튼은 평소엔 숨기고, 화면이 열린 뒤 3초가 지나도 Clerk가 로드되지 않을 때만 보인다(ADR 0026).
// 온라인이면 그 전에 다음 화면으로 넘어가 버튼을 보지 않는다. 오프라인이면 이 버튼이 현장 모드로 가는 유일한 길이다.
const SCENE_BUTTON_DELAY = 3000;
let splashPlayed = false;

// 배치(ADR 0026): 로고 그룹 위·아래 빈 공간을 71:29로 나눠 로고를 화면 위쪽 시각 중심에 둔다.
// 로딩 표시와 하단 버튼 자리는 내용이 없을 때도 높이를 잡아 두어, 나타나고 사라져도 로고가 움직이지 않는다.
const BAR_W = 120;
const BAR_FILL = BAR_W * 0.45;

// 진행률을 알 수 없는 로딩이라 민트 막대가 트랙 위를 왼쪽에서 오른쪽으로 계속 지나간다.
function LoadingBar() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-BAR_FILL, BAR_W] });
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="불러오는 중" style={s.track}>
      <Animated.View style={[s.fill, { transform: [{ translateX }] }]} />
    </View>
  );
}

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [played, setPlayed] = useState(splashPlayed);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setSlow(true), SCENE_BUTTON_DELAY);
    return () => clearTimeout(t);
  }, [isLoaded]);
  if (played && isLoaded) {
    if (!isSignedIn) return <Redirect href="/sign-in" />;
    return <Redirect href={getSharedPayloads().length > 0 ? '/share' : '/home'} />;
  }
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + space[8] }]}>
      <StatusBar barStyle="light-content" />
      <View style={s.above} />
      <Splash
        still={played}
        onDone={() => {
          splashPlayed = true;
          setPlayed(true);
        }}
      />
      <View style={s.loading}>
        {played && !isLoaded && (
          <>
            <LoadingBar />
            <Text style={s.loadingText}>불러오는 중...</Text>
          </>
        )}
      </View>
      <View style={s.below} />
      <View style={s.bottom}>
        {slow && !isLoaded && (
          <>
            <Text style={s.slowText}>연결이 늦어지고 있어요</Text>
            <Button label="사고 현장 모드" variant="emergency" icon="alert" onPress={() => router.push('/scene')} />
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingHorizontal: space[4], backgroundColor: color.ink },
  above: { flex: 71, minHeight: space[6] },
  below: { flex: 29, minHeight: space[6] },
  loading: { height: 38, marginTop: 40, alignItems: 'center', gap: 14 },
  track: { width: BAR_W, height: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: color.ink2 },
  fill: { width: BAR_FILL, height: 4, borderRadius: 999, backgroundColor: color.mint },
  loadingText: { fontSize: 14, lineHeight: 20, color: color.brand400 },
  bottom: { alignSelf: 'stretch', height: 84, justifyContent: 'flex-end', gap: 10 },
  slowText: { fontSize: 13, lineHeight: 20, textAlign: 'center', color: color.brand400 },
});
