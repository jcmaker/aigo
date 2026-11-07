import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { getSharedPayloads } from 'expo-sharing';
import { Text, View } from 'react-native';
import { Button, styles } from '@/components/ui';

// `/`는 로그인 여부와 상관없이 열려야 한다. 그룹 안에 두면 로그아웃 상태 첫 화면이 Unmatched Route가 된다.
// Clerk가 로드되기 전(오프라인이면 끝내 로드되지 않을 수 있다)에도 사고 현장 모드로 들어갈 수 있어야 한다.
export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  if (!isLoaded) {
    return (
      <View style={styles.screen}>
        <Text>불러오는 중...</Text>
        <Button label="사고 현장 모드" onPress={() => router.push('/scene')} />
      </View>
    );
  }
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return <Redirect href={getSharedPayloads().length > 0 ? '/share' : '/home'} />;
}
