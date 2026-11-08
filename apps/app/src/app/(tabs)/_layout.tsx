import { Tabs } from 'expo-router';
import { FloatingTabBar, TAB_ITEMS } from '@/components/ui';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <FloatingTabBar {...p} />} screenOptions={{ headerShown: false }}>
      {TAB_ITEMS.map((t) => (
        <Tabs.Screen key={t.route} name={t.route} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
