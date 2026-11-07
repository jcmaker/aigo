import { Stack } from 'expo-router';

// 로그인 검사 밖에 둔다. 이 파일이 있어야 scene 폴더가 루트 Stack에 한 화면으로 등록된다.
export default function SceneLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: '사고 현장 모드' }} />
      <Stack.Screen name="photos" options={{ title: '현장 사진' }} />
    </Stack>
  );
}
