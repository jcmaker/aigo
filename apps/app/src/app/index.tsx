import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { getSharedPayloads } from 'expo-sharing';
import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
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

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
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
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Splash
        still={played}
        onDone={() => {
          splashPlayed = true;
          setPlayed(true);
        }}
      />
      {played && !isLoaded && <Text style={s.loading}>불러오는 중...</Text>}
      {slow && !isLoaded && (
        <View style={s.bottom}>
          <Button label="사고 현장 모드" variant="danger" onPress={() => router.push('/scene')} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  loading: { position: 'absolute', left: 0, right: 0, bottom: 140, textAlign: 'center', color: color.gray9 },
  bottom: { position: 'absolute', left: space[4], right: space[4], bottom: space[8] },
});
