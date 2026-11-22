import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, Text, View, type ScrollViewInstance } from 'react-native';
import { ContactsCard } from '@/components/ContactsCard';
import { SceneGuide } from '@/components/SceneGuide';
import { Button, Card, Icon, Screen, TextField } from '@/components/ui';
import { color, radius, space, tabBarSpace, type } from '@/theme';
import { ReportHeader } from '@/components/report-sections';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/ui';
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

// 아래에 고정하는 신고 버튼(ADR 0035). 누르면 확인 창을 띄운 뒤 전화 앱을 연다.
const EMERGENCY = [
  { number: '112', label: '112 경찰 신고', title: '112 경찰에 전화할까요?', icon: 'siren' },
  { number: '119', label: '119 구급·소방', title: '119 구급·소방에 전화할까요?', icon: 'medical' },
] as const;

function call(number: string) {
  Linking.openURL(`tel:${number}`).catch(() => Alert.alert('전화를 걸 수 없습니다.', `${number}로 직접 전화해 주세요.`));
}

export function SceneBody({ tabInset, onBack }: { tabInset?: boolean; onBack?: () => void }) {
  const router = useRouter();
  // 아래 고정 112·119 버튼은 잘못 눌러도 바로 걸리지 않게 확인 창을 한 번 거친다.
  const [confirm, setConfirm] = useState<(typeof EMERGENCY)[number] | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const insurerY = useRef(0);
  const contactsY = useRef(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const insets = useSafeAreaInsets();
  const barBottom = insets.bottom + (tabInset ? tabBarSpace + 6 : space[3]);

  useEffect(() => {
    getInsurerPhone().then((p) => {
      setSaved(p);
      setPhone(p ?? '');
    });
  }, []);

  function scrollTo(y: number) {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - space[3]), animated: true });
  }

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
    <Screen scroll tabInset={tabInset} scrollRef={scrollRef} topColor={color.ink} barStyle="light-content">
      <ReportHeader title="사고 현장 모드" subtitle="로그인·인터넷 없이 쓸 수 있어요" onBack={onBack} />
      <SceneGuide
        handlers={{
          call112: () => call('112'),
          call119: () => call('119'),
          callEx: () => call('1588-2504'),
          insurer: () => (saved ? call(saved) : Alert.alert('보험사 번호가 없습니다.', '아래 보험사 카드에 번호를 저장해 주세요.')),
          photo: shoot,
        }}
      />
      <Text style={[type.headline, { fontSize: 17, color: color.gray12, marginTop: space[2] }]}>현장 도구</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[2] }}>
        <Tool icon="camera" label="현장 사진 촬영" sub="시각·위치가 함께 남아요" dark onPress={shoot} />
        <Tool icon="image" label="찍은 사진 보기" sub="폰에만 저장돼요" onPress={() => router.push('/scene/photos')} />
        <Tool icon="phone" label="보험사 전화" sub={saved ?? '번호를 먼저 저장해요'} onPress={() => (saved ? call(saved) : scrollTo(insurerY.current))} />
        <Tool icon="users" label="알릴 사람" sub="가족·지인에게 연락" onPress={() => scrollTo(contactsY.current)} />
      </View>
      <View onLayout={(e) => { insurerY.current = e.nativeEvent.layout.y; }}>
      <Card title="보험사">
        <TextField label="보험사 번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="보험사 전화번호" error={error} />
        <Button label="번호 저장" variant="secondary" size="md" onPress={savePhone} />
        <Button label="보험사에 전화" icon="phone" disabled={!saved} onPress={() => saved && call(saved)} />
      </Card>
      </View>
      <View onLayout={(e) => { contactsY.current = e.nativeEvent.layout.y; }}>
        <ContactsCard />
      </View>
      <View style={{ height: 64 }} />
    </Screen>
      {/* 신고는 엄지가 닿는 아래에 고정한다. 스크롤 위치와 상관없이 늘 보인다. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: space[4], right: space[4], bottom: barBottom, flexDirection: 'row', gap: space[2] }}>
        {EMERGENCY.map((e) => (
          <Pressable key={e.number} accessibilityRole="button" accessibilityLabel={e.label} onPress={() => setConfirm(e)}
            style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: radius.pill, backgroundColor: pressed ? '#A8270F' : color.danger600, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 })}>
            <Icon name={e.icon} size={20} color={color.white} />
            <Text style={[type.label, { fontSize: 16, color: color.white }]}>{e.label}</Text>
          </Pressable>
        ))}
      </View>
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable accessibilityLabel="닫기" onPress={() => setConfirm(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space[5] }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: color.white, borderRadius: radius.card, padding: space[5], gap: space[3] }}>
            <Text accessibilityRole="header" style={[type.title, { fontSize: 21, color: color.gray12 }]}>{confirm?.title}</Text>
            <Text style={[type.body, { fontSize: 15, color: color.gray11, lineHeight: 22 }]}>누르면 전화 앱이 {confirm?.number} 번호로 열려요.</Text>
            <Button label={`${confirm?.number ?? ''}에 전화 걸기`} variant="emergency" icon={confirm?.icon} onPress={() => { const n = confirm?.number; setConfirm(null); if (n) call(n); }} />
            <Button label="취소" variant="secondary" onPress={() => setConfirm(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Tool({ icon, label, sub, dark, onPress }: { icon: IconName; label: string; sub: string; dark?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ width: '48.5%', minHeight: 112, borderRadius: radius.row, padding: space[4], gap: space[2], borderWidth: dark ? 0 : 1, borderColor: color.line, backgroundColor: dark ? (pressed ? '#24385F' : color.ink) : pressed ? color.gray3 : color.white })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(63,207,142,0.18)' : color.mintSoft }}>
        <Icon name={icon} size={22} color={dark ? color.mint : color.mintDeep} />
      </View>
      <Text style={[type.headline, { fontSize: 16, fontWeight: '700', color: dark ? color.white : color.gray12 }]}>{label}</Text>
      <Text numberOfLines={1} style={[type.caption, { fontSize: 13, color: dark ? 'rgba(255,255,255,0.8)' : color.gray11 }]}>{sub}</Text>
    </Pressable>
  );
}
