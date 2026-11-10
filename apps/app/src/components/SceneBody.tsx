import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, Text, View } from 'react-native';
import { ContactsCard } from '@/components/ContactsCard';
import { SceneGuide } from '@/components/SceneGuide';
import { Button, Card, Icon, ListRow, Screen, TextField, TopBar } from '@/components/ui';
import { color, radius, space, type } from '@/theme';
import { addScenePhoto, getInsurerPhone, setInsurerPhone, type SceneLocation } from '@/lib/scene-store';


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

export function SceneBody({ tabInset, onBack }: { tabInset?: boolean; onBack?: () => void }) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
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
    <>
    <Screen scroll tabInset={tabInset}>
      <TopBar
        title="사고 현장 모드"
        onBack={onBack}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="신고" onPress={() => setReportOpen(true)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: pressed ? color.danger600 : color.danger })}>
            <Icon name="alert" size={18} color={color.white} />
            <Text style={[type.label, { fontSize: 15, color: color.white }]}>신고</Text>
          </Pressable>
        }
      />
      <SceneGuide
        handlers={{
          call112: () => call('112'),
          call119: () => call('119'),
          callEx: () => call('1588-2504'),
          insurer: () => (saved ? call(saved) : Alert.alert('보험사 번호가 없습니다.', '아래 보험사 카드에 번호를 저장해 주세요.')),
          photo: shoot,
        }}
      />
      <Button label="현장 사진 촬영" variant="dark" icon="camera" disabled={shooting} onPress={shoot} />
      <ListRow
        leading={<Icon name="image" size={20} color={color.gray11} />}
        title="찍은 사진 보기"
        trailing={<Icon name="chevron" size={16} color={color.gray9} />}
        onPress={() => router.push('/scene/photos')}
      />
      <Card title="보험사">
        <TextField label="보험사 번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="보험사 전화번호" error={error} />
        <Button label="번호 저장" variant="secondary" size="md" onPress={savePhone} />
        <Button label="보험사에 전화" icon="phone" disabled={!saved} onPress={() => saved && call(saved)} />
      </Card>
      <ContactsCard />
    </Screen>
      {/* 오른쪽 위 신고 버튼을 누르면 112·119 중 고른다. */}
      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <Pressable accessibilityLabel="닫기" onPress={() => setReportOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: color.white, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space[5], paddingBottom: space[8], gap: space[3] }}>
            <Text accessibilityRole="header" style={[type.title, { fontSize: 20, color: color.gray12 }]}>어디에 신고할까요?</Text>
            <Button label="112 경찰" variant="emergency" icon="siren" onPress={() => { setReportOpen(false); call('112'); }} />
            <Button label="119 구급·소방" variant="emergency" icon="medical" onPress={() => { setReportOpen(false); call('119'); }} />
            <Button label="닫기" variant="secondary" onPress={() => setReportOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
