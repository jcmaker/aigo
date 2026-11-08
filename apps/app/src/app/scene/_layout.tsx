import { Stack } from 'expo-router';

// 로그인 검사 밖에 둔다. 이 파일이 있어야 scene 폴더가 루트 Stack에 한 화면으로 등록된다.
// 헤더는 화면마다 TopBar로 그린다.
export default function SceneLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
