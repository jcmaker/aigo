import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { getSharedPayloads } from 'expo-sharing';
import { useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { Splash } from '@/components/ui/Splash';
import { color, space } from '@/theme';

// `/`는 로그인 여부와 상관없이 열려야 한다. 그룹 안에 두면 로그아웃 상태 첫 화면이 Unmatched Route가 된다.
// Clerk가 로드되기 전(오프라인이면 끝내 로드되지 않을 수 있다)에도 사고 현장 모드로 들어갈 수 있어야 한다.
// 진입 모션은 앱을 새로 시작할 때 한 번만 보인다. 로그인·로그아웃, SSO 복귀, 공유 화면 "처음으로"로 index가 다시 마운트되면 건너뛴다.
let splashPlayed = false;

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [played, setPlayed] = useState(splashPlayed);
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
      <View style={s.bottom}>
        <Button label="사고 현장 모드" variant="danger" onPress={() => router.push('/scene')} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  loading: { position: 'absolute', left: 0, right: 0, bottom: 140, textAlign: 'center', color: color.gray9 },
  bottom: { position: 'absolute', left: space[4], right: space[4], bottom: space[8] },
});
