import { useRouter } from 'expo-router';
import { SceneBody } from '@/components/SceneBody';

export default function SceneScreen() {
  const router = useRouter();
  // 공유 화면에서 replace로 들어오면 뒤로 갈 기록이 없다.
  return <SceneBody onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
