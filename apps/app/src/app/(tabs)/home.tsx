import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
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

// 사고 났어요 / 분석 결과 두 갈래
// danger면 빨간 바탕으로 가장 먼저 눈에 띄게 한다
function ActionTile({ icon, iconBg, iconFg, title, caption, onPress, danger }: { icon: IconName; iconBg: string; iconFg: string; title: string; caption: string; onPress: () => void; danger?: boolean }) {
  return (
    <PressCard label={title} onPress={onPress} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: danger ? color.danger : color.white, borderRadius: radius.card, padding: space[4], gap: space[3] }}>
        <IconBox name={icon} bg={iconBg} fg={iconFg} />
        <View style={{ gap: 2 }}>
          <Text style={[type.headline, { color: danger ? color.white : color.gray12 }]}>{title}</Text>
          <Text style={[type.caption, { color: danger ? color.danger300 : color.gray11 }]}>{caption}</Text>
        </View>
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
  const n = {
    done: items.filter((a) => a.status === 'done').length,
    running: items.filter((a) => a.status === 'queued' || a.status === 'processing').length,
  };
  const upload = () => router.push('/upload');
  const deviceConnected = false; // 기기 연결 기능 전까지는 항상 연결 안 됨

  return (
    <Screen scroll tabInset style={{ flexGrow: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark height={32} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? '알림, 새 알림 있음' : '알림'}
          onPress={() => router.push('/notifications')}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="bell" size={18} color={color.ink} />
          {unread ? <View style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: color.danger, borderWidth: 1.5, borderColor: color.white }} /> : null}
        </Pressable>
      </View>

      {/* DashPi 기기 상태. 기기 연결 기능이 들어오면 deviceConnected를 실제 상태로 바꾼다. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.white, borderRadius: radius.card, padding: space[4] }}>
        <IconBox name="dashcam" bg={color.gray3} fg={color.gray11} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Text style={[type.headline, { color: color.gray12 }]}>DashPi 기기</Text>
            <StatusChip tone="neutral" label="준비 중" />
          </View>
          <Text style={[type.caption, { color: color.gray11 }]}>연결하면 사고 시 영상을 자동 분석해요</Text>
        </View>
        <View
          accessible
          accessibilityLabel={deviceConnected ? '기기 연결됨' : '기기 연결 안 됨'}
          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: deviceConnected ? color.online : color.gray9 }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <ActionTile danger icon="alert" iconBg="rgba(255,255,255,0.2)" iconFg={color.white} title="사고 났어요" caption="신고 · 현장 기록" onPress={() => router.push('/emergency')} />
        <ActionTile
          icon="file" iconBg={color.brand200} iconFg={color.brand600} title="분석 결과"
          caption={n.running ? `분석 중 ${n.running}건` : `완료 ${n.done}건`}
          onPress={() => router.push('/analyses')}
        />
      </View>

      {/* 메인: 영상 분석하기. 남은 화면을 채운다. */}
      <PressCard label="사고 영상, 바로 분석해요" onPress={upload} style={{ flexGrow: 1, minHeight: 280 }}>
        <View style={{ flex: 1, backgroundColor: color.brand, borderRadius: radius.card, padding: space[5], gap: space[4] }}>
          <View style={{ gap: space[1] }}>
            <Text accessibilityRole="header" style={[type.title, { color: color.onBrand }]}>사고 영상, 바로 분석해요</Text>
            <Text style={[type.caption, { color: color.brand200 }]}>영상을 올리면 과실 비율과 근거 장면을 알려드려요</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="video" size={44} color={color.onBrand} />
            </View>
            <Text style={[type.micro, { color: color.brand200 }]}>mp4, mov, webm, avi · 200MB · 2분 이하</Text>
          </View>
          <Button label="갤러리에서 영상 고르기" variant="secondary" icon="upload" onPress={upload} />
        </View>
      </PressCard>
    </Screen>
  );
}
