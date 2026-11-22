import { useClerk, useUser } from '@clerk/expo';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, MenuGroup, MenuRow, Screen, useConfirm } from '@/components/ui';
import { ReportHeader } from '@/components/report-sections';
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
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const [error, setError] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();

  const remove = () =>
    ask({
      title: '탈퇴할까요?',
      body: '계정과 분석 기록이 모두 지워져요. 되돌릴 수 없어요.',
      confirmLabel: '탈퇴하기',
      danger: true,
      onConfirm: async () => {
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
    });

  const logout = async () => {
    await unregisterPush(api); // 실패해도 로그아웃은 계속한다.
    clearAppCache();
    signOut().catch(() => setError('로그아웃하지 못했습니다. 다시 시도해 주세요.'));
  };
  const group = (label: string) => <Text style={[t.label, { color: color.gray11, marginTop: space[2] }]}>{label}</Text>;

  // 남색 머리글 → 프로필 → 내 서비스 → 로그아웃 → (맨 아래 작게) 탈퇴 → 버전(ADR 0038)
  return (
    <Screen scroll tabInset topColor={color.ink} barStyle="light-content">
      <ReportHeader title="계정" />
      {dialog}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: space[4] }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[t.title, { color: color.mint }]}>{email.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[t.label, { fontSize: 15, color: color.gray12 }]} numberOfLines={1}>{email}</Text>
          {user?.createdAt ? <Text style={[t.caption, { fontSize: 13, color: color.gray11 }]}>가입 {seoulDate(user.createdAt.toISOString())}</Text> : null}
        </View>
      </View>
      {error ? <Text style={{ ...t.caption, color: color.danger600 }}>{error}</Text> : null}

      {/* 내 분석·사고 현장 모드는 하단 메뉴에 있어 이 화면에는 하단 메뉴에 없는 상품 보기만 둔다(ADR 0038). */}
      {group('내 서비스')}
      <MenuGroup>
        <MenuRow
          first
          icon="file"
          title="상품 보기"
          subtitle="웹에서 열기"
          onPress={() => WebBrowser.openBrowserAsync(PRODUCTS_URL).catch(() => setError('상품 페이지를 열지 못했습니다.'))}
        />
      </MenuGroup>

      <Button variant="secondary" icon="logout" label="로그아웃" onPress={logout} style={{ marginTop: space[2] }} />

      {/* 되돌릴 수 없는 탈퇴는 자주 쓰는 로그아웃보다 눈에 덜 띄게 맨 아래 작은 글씨로 둔다. 누르면 확인 창을 거친다. */}
      <Pressable accessibilityRole="button" accessibilityLabel="탈퇴하기" onPress={remove} hitSlop={8} style={{ alignSelf: 'center', marginTop: space[4], alignItems: 'center', gap: 2 }}>
        <Text style={[t.label, { fontSize: 14, color: color.danger600, textDecorationLine: 'underline' }]}>탈퇴하기</Text>
        <Text style={[t.micro, { color: color.gray11 }]}>계정과 분석 기록을 모두 지워요</Text>
      </Pressable>
      <Text style={[t.micro, { color: color.gray11, textAlign: 'center', marginTop: space[2] }]}>AIGO 앱 v{Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}
