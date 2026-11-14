import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { RecentAnalyses } from '@/components/AnalysisRow';
import { Wordmark } from '@/components/Wordmark';
import { Button, Icon, Screen, StatusChip, type IconName } from '@/components/ui';
import type { Analysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import { getSeenNotices } from '@/lib/notice-store';
import { toNotices } from '@/lib/notices';
import { color, radius, space, type } from '@/theme';

// 눌렀을 때 버튼처럼 살짝 줄어드는 카드
function PressCard({ label, onPress, style, children }: { label: string; onPress: () => void; style?: object; children: ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={() => spring(0.97)} onPressOut={() => spring(1)} style={{ flex: 1 }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

function IconBox({ name, bg, fg, size = 40 }: { name: IconName; bg: string; fg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.icon, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size * 0.5} color={fg} />
    </View>
  );
}

// 홈의 작은 설명 글씨는 13px 대신 15px로 키운다(ADR 0028).
const small = { fontSize: 15, lineHeight: 21 } as const;

// 사고 현장 모드: 화면 아래쪽 전체 폭의 빨간 큰 버튼(ADR 0030). 어느 손으로 들어도 엄지가 바로 닿는 자리다.
// 바탕은 진한 빨강(danger600)이라 흰 글씨 대비 5.28:1, 설명 글씨 4.76:1.
function SceneButton({ onPress }: { onPress: () => void }) {
  return (
    <PressCard label="사고 현장 모드, 신고와 현장 기록" onPress={onPress}>
      <View style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.danger600, borderRadius: radius.card, paddingHorizontal: space[4], paddingVertical: space[3] }}>
        <IconBox name="alert" bg="rgba(255,255,255,0.18)" fg={color.white} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { fontSize: 19, color: color.white }]}>사고 현장 모드</Text>
          <Text style={[type.caption, small, { color: color.danger300 }]}>신고 · 현장 기록</Text>
        </View>
        <Icon name="arrow" size={22} color={color.white} />
      </View>
    </PressCard>
  );
}

export default function HomeScreen() {
  const api = useApi();
  const router = useRouter();
  const [items, setItems] = useState<Analysis[]>([]);
  const [unread, setUnread] = useState(false);

  // 내 분석과 같은 요청. 실패하면 0으로 둔다(홈은 오류를 따로 보이지 않는다).
  useFocusEffect(
    useCallback(() => {
      api<{ items: Analysis[] }>('/api/v1/analyses?limit=100').then(async (r) => {
        setItems(r.items);
        const seen = await getSeenNotices();
        setUnread(toNotices(r.items).some((n) => !seen.has(n.id)));
      }, () => {});
    }, [api]),
  );
  const upload = () => router.push('/upload');
  const deviceConnected = false; // 기기 연결 기능 전까지는 항상 연결 안 됨
  // 분석 결과는 영상을 올린 뒤에야 의미가 있다. 분석이 있을 때만 가장 최근 1건을 보인다(목록은 "내 분석" 탭).
  const latest = items[0];
  // 최근 분석 줄이 보이고 화면 높이가 낮으면(720 미만) 분석 카드의 카메라 그림을 빼서, 사고 현장 모드 버튼이 스크롤 없이 보이게 한다.
  const { height } = useWindowDimensions();
  const compact = !!latest && height < 720;

  return (
    <Screen scroll tabInset style={{ flexGrow: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark height={32} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? '알림, 새 알림 있음' : '알림'}
          onPress={() => router.push('/notifications')}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="bell" size={18} color={color.ink} />
          {unread ? <View style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: color.danger, borderWidth: 1.5, borderColor: color.white }} /> : null}
        </Pressable>
      </View>

      {latest ? <RecentAnalyses items={items} limit={1} title="최근 분석" /> : null}

      {/* 메인: 영상 분석하기. 남색 바탕에 민트 포인트. 아래 사고 현장 모드 버튼이 한 화면에 들어오도록 높이를 줄였다. */}
      <PressCard label="사고 영상, 바로 분석해요" onPress={upload} style={{ flexGrow: 1, minHeight: compact ? 0 : 220 }}>
        <View style={{ flex: 1, backgroundColor: color.ink, borderRadius: radius.card, padding: space[5], gap: space[3] }}>
          <View style={{ gap: space[1] }}>
            <Text accessibilityRole="header" style={[type.title, { color: color.white }]}>사고 영상, 바로 분석해요</Text>
            <Text style={[type.caption, small, { color: color.brand400 }]}>영상을 올리면 과실 비율과 근거 장면을 알려드려요</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
            {compact ? null : (
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(63,207,142,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="video" size={30} color={color.mint} />
              </View>
            )}
            <Text style={[type.caption, { color: color.brand400 }]}>mp4, mov, webm, avi · 200MB · 2분 이하</Text>
          </View>
          <Button label="갤러리에서 영상 고르기" variant="onDark" icon="upload" onPress={upload} />
        </View>
      </PressCard>

      {/* DashPi 기기 상태. 아직 준비 중이라 작은 한 줄로 둔다. 기기 연결 기능이 들어오면 deviceConnected를 실제 상태로 바꾼다. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: radius.row, paddingHorizontal: space[4], paddingVertical: space[3] }}>
        <Icon name="dashcam" size={20} color={color.gray11} />
        <Text style={[type.caption, small, { flex: 1, color: color.gray12 }]} numberOfLines={1}>DashPi 기기</Text>
        <StatusChip tone="neutral" label="준비 중" />
        <View
          accessible
          accessibilityLabel={deviceConnected ? '기기 연결됨' : '기기 연결 안 됨'}
          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: deviceConnected ? color.online : color.gray9 }}
        />
      </View>

      <SceneButton onPress={() => router.push('/emergency')} />
    </Screen>
  );
}
