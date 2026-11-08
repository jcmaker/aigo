import { Stack } from 'expo-router';

// 이 파일이 있어야 (auth)가 한 화면으로 묶여 Stack.Protected가 적용된다.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
