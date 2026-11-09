import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { EmptyState, Icon, Screen, TopBar } from '@/components/ui';
import type { Analysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import { getSeenNotices, markNoticesSeen } from '@/lib/notice-store';
import { isToday, timeAgo, toNotices, type Notice } from '@/lib/notices';
import { color, radius, space, type } from '@/theme';

function NoticeRow({ n, unread, now, onPress }: { n: Notice; unread: boolean; now: Date; onPress: () => void }) {
  const done = n.kind === 'done';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? '새 알림, ' : ''}${n.title}, ${n.body}, ${timeAgo(n.at, now)}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', gap: space[3], paddingVertical: space[3], paddingHorizontal: space[1], borderRadius: radius.row, backgroundColor: pressed ? color.gray2 : 'transparent' })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? color.brand200 : color.danger300 }}>
        <Icon name={done ? 'check' : 'alert'} size={18} color={done ? color.brand600 : color.danger600} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text style={[type.label, { flex: 1, fontSize: 14, color: unread ? color.gray12 : color.gray11 }]}>{n.title}</Text>
          <Text style={[type.micro, { color: color.gray9 }]}>{timeAgo(n.at, now)}</Text>
          {unread ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.brand }} /> : null}
        </View>
        <Text style={[type.caption, { color: unread ? color.gray12 : color.gray11 }]} numberOfLines={2}>{n.body}</Text>
      </View>
    </Pressable>
  );
}

function Group({ title, items, seen, now, open }: { title: string; items: Notice[]; seen: Set<string>; now: Date; open: (n: Notice) => void }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[type.label, { color: color.gray11, paddingHorizontal: space[1] }]}>{title}</Text>
      <View style={{ backgroundColor: color.white, borderRadius: radius.card, paddingVertical: space[2], paddingHorizontal: space[3] }}>
        {items.map((n) => <NoticeRow key={n.id} n={n} unread={!seen.has(n.id)} now={now} onPress={() => open(n)} />)}
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const api = useApi();
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  // 화면을 연 순간의 읽음 상태로 그린다. 저장은 바로 하지만 점은 이번에 보는 동안 남겨 둔다.
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const now = new Date();

  useFocusEffect(
    useCallback(() => {
      Promise.all([api<{ items: Analysis[] }>('/api/v1/analyses?limit=100').then((r) => toNotices(r.items), () => []), getSeenNotices()]).then(([list, s]) => {
        setSeen(s);
        setNotices(list);
        markNoticesSeen(list.map((n) => n.id));
      });
    }, [api]),
  );

  const open = (n: Notice) => router.push(`/analyses/${n.analysisId}`);
  const today = notices?.filter((n) => isToday(n.at, now)) ?? [];
  const earlier = notices?.filter((n) => !isToday(n.at, now)) ?? [];

  return (
    <Screen scroll>
      <TopBar title="알림" onBack={() => router.back()} />
      {notices === null ? (
        <ActivityIndicator color={color.gray9} style={{ marginTop: space[8] }} />
      ) : notices.length ? (
        <>
          <Group title="오늘" items={today} seen={seen} now={now} open={open} />
          <Group title="이전 알림" items={earlier} seen={seen} now={now} open={open} />
        </>
      ) : (
        <EmptyState icon="bell" title="아직 알림이 없어요" body="영상 분석이 끝나면 여기에서 알려 드릴게요." />
      )}
    </Screen>
  );
}
