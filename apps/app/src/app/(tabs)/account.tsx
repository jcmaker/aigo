import { useClerk, useUser } from '@clerk/expo';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, MenuGroup, MenuRow, PageTitle, Screen } from '@/components/ui';
import { seoulDate } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { clearAppCache } from '@/lib/cache';
import { unregisterPush } from '@/lib/push';
import { color, radius, space, type as t } from '@/theme';

// /products 목록 페이지는 웹에 없다. 상품 목록은 첫 화면의 #products 구역이다.
const PRODUCTS_URL = 'https://aigo.up.railway.app/#products';
const DELETED_BUT_SIGNED_IN = '탈퇴는 완료됐지만 로그아웃하지 못했습니다. 앱을 다시 열어 주세요.';

export default function AccountScreen() {
  const api = useApi();
  const { signOut } = useClerk();
  const router = useRouter();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const [error, setError] = useState<string | null>(null);

  const remove = () =>
    Alert.alert('탈퇴', '계정과 분석 기록이 모두 삭제됩니다. 계속할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '탈퇴',
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/api/v1/me', { method: 'DELETE' });
          } catch (e) {
            setError((e as ApiFailure).message);
            return;
          }
          // 계정은 이미 지워졌다. 로그아웃 실패를 삭제 실패로 보이게 하지 않는다.
          clearAppCache();
          signOut().catch(() => setError(DELETED_BUT_SIGNED_IN));
        },
      },
    ]);

  const logout = async () => {
    await unregisterPush(api); // 실패해도 로그아웃은 계속한다.
    clearAppCache();
    signOut().catch(() => setError('로그아웃하지 못했습니다. 다시 시도해 주세요.'));
  };
  const group = (label: string) => <Text style={[t.label, { color: color.gray11, marginTop: space[2] }]}>{label}</Text>;

  // 시안의 마이페이지 배치: 프로필 카드 → 묶음 메뉴 → 로그아웃 → 버전
  return (
    <Screen scroll tabInset>
      <PageTitle title="계정" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.white, borderRadius: radius.card, padding: space[4] }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: color.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[t.title, { color: color.ink }]}>{email.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[t.label, { fontSize: 15, color: color.gray12 }]} numberOfLines={1}>{email}</Text>
          {user?.createdAt ? <Text style={[t.caption, { fontSize: 12, color: color.gray11 }]}>가입 {seoulDate(user.createdAt.toISOString())}</Text> : null}
        </View>
      </View>
      {error ? <Text style={{ ...t.caption, color: color.danger600 }}>{error}</Text> : null}

      {group('내 서비스')}
      <MenuGroup>
        <MenuRow first icon="list" title="내 분석" subtitle="분석 기록 · 레포트" onPress={() => router.push('/analyses')} />
        <MenuRow icon="alert" urgent title="사고 현장 모드" subtitle="신고 · 체크리스트 · 현장 사진" onPress={() => router.push('/emergency')} />
        <MenuRow
          icon="file"
          title="상품 보기"
          subtitle="웹에서 열기"
          onPress={() => WebBrowser.openBrowserAsync(PRODUCTS_URL).catch(() => setError('상품 페이지를 열지 못했습니다.'))}
        />
      </MenuGroup>

      {group('계정 관리')}
      <MenuGroup>
        <MenuRow first icon="trash" danger title="탈퇴" subtitle="계정과 분석 기록을 모두 지웁니다" onPress={remove} />
      </MenuGroup>

      <Button variant="secondary" icon="logout" label="로그아웃" onPress={logout} style={{ marginTop: space[2] }} />
      <Text style={[t.micro, { color: color.gray9, textAlign: 'center' }]}>AIGO 앱 v{Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}
