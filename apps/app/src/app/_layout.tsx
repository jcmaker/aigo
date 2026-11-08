import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import * as Notifications from 'expo-notifications';
import { getSharedPayloads } from 'expo-sharing';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useApi } from '@/lib/api';
import { analysisIdFrom, registerPush } from '@/lib/push';

function Routes() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  // 이미 권한이 있으면 로그인 때마다 토큰을 다시 등록한다(같은 폰의 다른 계정으로 옮겨 가게). 권한 요청은 첫 분석 제출 뒤에 한다.
  useEffect(() => {
    if (isLoaded && isSignedIn) registerPush(api, false);
  }, [isLoaded, isSignedIn, api]);

  // 로그인 전에 받은 공유 영상이 남아 있으면 로그인 뒤 공유 화면으로 돌아가 이어서 처리한다.
  useEffect(() => {
    // 화면 이동마다 다시 돌면 안내 화면을 뒤로가기로 나가도 끌려온다. 로그인 상태가 바뀔 때만 본다.
    if (isLoaded && isSignedIn && pathname !== '/share' && getSharedPayloads().length > 0) router.replace('/share');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, router]);

  // 알림을 눌러 앱이 시작되면 Clerk가 로드되기 전에는 보호 구역이 닫혀 있다. 로그인이 확인된 뒤에 이동한다.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !last) return;
    const key = last.notification.request.identifier;
    if (handled.current === key) return;
    handled.current = key;
    const id = analysisIdFrom(last.notification.request.content.data);
    if (id !== null) router.push(`/analyses/${id}`);
  }, [isLoaded, isSignedIn, last, router]);

  // 로딩 중에는 Stack을 그대로 그린다. 오프라인에서 Clerk가 끝내 로드되지 않아도 index와 scene은 열려야 한다.
  // 두 보호 구역은 로딩이 끝나기 전에는 닫아 두어 로그인 화면이 잠깐 보이는 일이 없게 한다.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="scene" />
      <Stack.Screen name="share" />
      <Stack.Protected guard={isLoaded && !!isSignedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="analyses/[id]" options={{ headerShown: true }} />
      </Stack.Protected>
      <Stack.Protected guard={isLoaded && !isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache}>
      <Routes />
    </ClerkProvider>
  );
}
