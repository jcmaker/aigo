import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, styles } from '@/components/ui';

export default function HomeScreen() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>AIGO</Text>
      <Button label="영상 분석하기" onPress={() => router.push('/upload')} />
      <Button label="사고 현장 모드" secondary onPress={() => router.push('/scene')} />
    </View>
  );
}
