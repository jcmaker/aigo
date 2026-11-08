import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecentAnalyses } from '@/components/AnalysisRow';
import { Icon, IconTile, Screen, SectionTitle, type IconName } from '@/components/ui';
import type { Analysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import { color, radius, space, type } from '@/theme';

// 시안의 홈 배치: 인사와 큰 제목 → 짙은 카드(분석 시작) → 빠른 시작 2×2 → 최근 분석 기록
export default function HomeScreen() {
  const api = useApi();
  const router = useRouter();
  const [items, setItems] = useState<Analysis[]>([]);

  // 내 분석과 같은 요청. 실패하면 빈 목록으로 둔다(홈은 오류를 따로 보이지 않는다).
  useFocusEffect(
    useCallback(() => {
      api<{ items: Analysis[] }>('/api/v1/analyses?limit=100').then((r) => setItems(r.items), () => {});
    }, [api]),
  );
  // 가장 최근 완료 레포트. 없으면 목록으로 간다.
  const latestDone = items.find((a) => a.status === 'done');

  const quick: { icon: IconName; title: string; desc: string; to: Href; danger?: boolean }[] = [
    { icon: 'alert', title: '사고 현장 모드', desc: '신고 · 현장 체크리스트', to: '/emergency', danger: true },
    { icon: 'upload', title: '영상 올리기', desc: '갤러리에서 선택', to: '/upload' },
    { icon: 'list', title: '내 분석', desc: '목록 · 진행 상태', to: '/analyses' },
    { icon: 'file', title: '분석 레포트', desc: latestDone ? '최근 결과 보기' : '완료된 분석 없음', to: latestDone ? `/analyses/${latestDone.id}` : '/analyses' },
  ];

  return (
    <Screen scroll tabInset>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: space[2] }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.label, { color: color.gray11 }]}>안녕하세요</Text>
          <Text accessibilityRole="header" style={[type.title, { color: color.gray12 }]}>
            사고 영상,{'\n'}
            <Text style={{ color: color.brand600 }}>쉽고 명확하게 확인하세요.</Text>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="계정"
          onPress={() => router.push('/account')}
          style={{ width: 44, height: 44, borderRadius: radius.icon, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="user" size={20} color={color.ink} />
        </Pressable>
      </View>

      <View style={{ backgroundColor: color.ink, borderRadius: radius.card, padding: space[5], gap: space[3], overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -18, bottom: -22, opacity: 0.12 }} pointerEvents="none">
          <Icon name="video" size={150} color={color.brand} />
        </View>
        <Text style={[type.micro, { color: color.brand400, letterSpacing: 1 }]}>AI ACCIDENT VIDEO ANALYSIS</Text>
        <Text style={[type.title, { color: color.white }]}>분석이 필요한 영상이{'\n'}있으신가요?</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/upload')}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color.brand, borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: space[4], marginTop: space[1] }}
        >
          <Text style={[type.label, { fontSize: 14, color: color.ink }]}>영상 분석 시작하기</Text>
          <Icon name="chevron" size={14} color={color.ink} />
        </Pressable>
      </View>

      <SectionTitle title="빠른 시작" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {quick.map((q) => (
          <Pressable
            key={q.title}
            accessibilityRole="button"
            accessibilityLabel={`${q.title}, ${q.desc}`}
            onPress={() => router.push(q.to)}
            style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: color.white, borderRadius: radius.card - 4, padding: space[4], gap: space[3] }}
          >
            <IconTile name={q.icon} danger={q.danger} />
            <View style={{ gap: 2 }}>
              <Text style={[type.label, { fontSize: 15, color: color.gray12 }]}>{q.title}</Text>
              <Text style={[type.caption, { fontSize: 12, color: color.gray11 }]}>{q.desc}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {items.length ? <RecentAnalyses items={items} /> : null}
    </Screen>
  );
}
