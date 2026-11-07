import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text } from 'react-native';
import { Button, ErrorText, Input, styles } from '@/components/ui';
import { addScenePhoto, getInsurerPhone, setInsurerPhone, type SceneLocation } from '@/lib/scene-store';

const CHECKLIST = [
  '비상등을 켜고 안전한 곳으로 대피하세요.',
  '뒤따르는 차에 주의하세요. 2차 사고가 날 수 있습니다.',
  '다친 사람이 있는지 확인하세요.',
  '112, 119에 신고하세요.',
  '현장 사진을 찍어 두세요.',
  '보험사에 연락하세요.',
];

const LOCATION_TIMEOUT_MS = 5000;

async function readLocation(): Promise<SceneLocation | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// 위치는 촬영을 막지 않는다. 권한 창 대기까지 포함해 권한 거부, 실패, 시간 초과는 모두 null이다.
async function currentLocation(): Promise<SceneLocation | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([readLocation(), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function call(number: string) {
  Linking.openURL(`tel:${number}`).catch(() => Alert.alert('전화를 걸 수 없습니다.', `${number}로 직접 전화해 주세요.`));
}

export default function SceneScreen() {
  const router = useRouter();
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [saved, setSaved] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    getInsurerPhone().then((p) => {
      setSaved(p);
      setPhone(p ?? '');
    });
  }, []);

  async function savePhone() {
    try {
      await setInsurerPhone(phone);
      setSaved(phone.trim());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    }
  }

  async function shoot() {
    setShooting(true);
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        Alert.alert('카메라 권한이 필요합니다.', '설정에서 AIGO의 카메라 권한을 허용해 주세요.', [
          { text: '닫기', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      // 위치는 카메라가 열려 있는 동안 얻는다.
      const location = currentLocation();
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) return;
      await addScenePhoto(result.assets[0].uri, new Date().toISOString(), await location);
      Alert.alert('사진을 저장했습니다.');
    } catch {
      Alert.alert('사진을 저장하지 못했습니다.', '다시 시도해 주세요.');
    } finally {
      setShooting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      {CHECKLIST.map((text, i) => (
        <Pressable
          key={text}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checked[i] }}
          onPress={() => setChecked(checked.map((c, j) => (j === i ? !c : c)))}
        >
          <Text style={{ fontSize: 16 }}>{checked[i] ? '☑ ' : '☐ '}{text}</Text>
        </Pressable>
      ))}
      <Button label="112 신고 전화" onPress={() => call('112')} />
      <Button label="119 신고 전화" onPress={() => call('119')} />
      <Button label="보험사에 전화" disabled={!saved} onPress={() => saved && call(saved)} />
      <Text style={styles.title}>보험사 번호</Text>
      <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="보험사 전화번호" />
      <ErrorText>{error}</ErrorText>
      <Button label="번호 저장" secondary onPress={savePhone} />
      <Button label="현장 사진 촬영" disabled={shooting} onPress={shoot} />
      <Button label="찍은 사진 보기" secondary onPress={() => router.push('/scene/photos')} />
    </ScrollView>
  );
}
