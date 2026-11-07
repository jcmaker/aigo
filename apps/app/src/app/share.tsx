import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, ErrorText, styles } from '@/components/ui';
import { videoName } from '@/lib/upload';

// 공유 메뉴로 받은 영상을 업로드 화면으로 넘긴다. 로그인 보호 밖에 두고, 로그인 전이면 받은 데이터를 지우지 않고 안내만 한다.
// 스택에 남아 있으면 로그인 순간 이 화면이 데이터를 지우고 닫힌 경로로 이동하므로 로그인 화면으로 갈 때 교체한다.
// 로그인 뒤에는 index와 _layout이 남은 공유 데이터를 보고 이 화면으로 돌려보낸다.
export default function ShareScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const { sharedPayloads, resolvedSharedPayloads, isResolving, error, clearSharedPayloads } = useIncomingShare();
  const done = useRef(false);

  // Android는 content:// 를 앱 캐시 파일로 복사해 file:// 로 준다(contentUri). 그대로 업로드에 쓸 수 있다.
  const video = resolvedSharedPayloads.length === 1 ? resolvedSharedPayloads[0] : null;
  const isVideo = video?.contentType === 'video' || !!video?.mimeType?.startsWith('video/');
  const uri = isVideo ? video?.contentUri : null;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !uri || done.current) return;
    done.current = true;
    clearSharedPayloads(); // 같은 영상이 다시 열리지 않게 한다.
    // 공유로 앱이 켜지면 스택에 홈이 없다. 홈을 깔아야 레포트에서 돌아갈 수 있다.
    router.replace('/home');
    router.push({ pathname: '/upload', params: { uri, name: videoName(uri, video?.originalName, video?.mimeType), size: String(video?.contentSize ?? '') } });
  }, [isLoaded, isSignedIn, uri, video, clearSharedPayloads, router]);

  // 해석이 시작되기 전(첫 렌더)에도 결과가 비어 있으므로 데이터가 있고 아직 결과도 오류도 없으면 로딩으로 본다.
  const waiting = sharedPayloads.length > 0 && resolvedSharedPayloads.length === 0 && !error;
  if (!isLoaded || (isSignedIn && (isResolving || waiting || uri))) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator />
        {/* 오프라인이면 Clerk가 끝내 로드되지 않는다. */}
        {!isLoaded ? <Button label="사고 현장 모드" secondary onPress={() => router.replace('/scene')} /> : null}
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>로그인이 필요합니다</Text>
        <Text>공유받은 영상은 로그인한 뒤 이어서 올릴 수 있습니다.</Text>
        <Button label="로그인하러 가기" onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }

  // 공유가 없거나(앱을 그냥 연 경우), 영상이 아니거나, 여러 개이거나, 해석에 실패한 경우
  const message =
    sharedPayloads.length === 0
      ? '공유받은 영상이 없습니다.'
      : resolvedSharedPayloads.length > 1
        ? '영상 한 개만 분석할 수 있습니다. 영상을 하나 골라 다시 공유해 주세요.'
        : error || isVideo
          ? '공유받은 파일을 읽지 못했습니다. 다시 공유해 주세요.'
          : '영상 파일만 분석할 수 있습니다.';
  return (
    <View style={styles.screen}>
      <ErrorText>{message}</ErrorText>
      <Button
        label="처음으로"
        secondary
        onPress={() => {
          clearSharedPayloads();
          router.replace('/');
        }}
      />
    </View>
  );
}
