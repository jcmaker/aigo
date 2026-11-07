import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="analyses" options={{ title: '내 분석' }} />
      <Tabs.Screen name="account" options={{ title: '계정' }} />
    </Tabs>
  );
}
