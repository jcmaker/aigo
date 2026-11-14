import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';
import { AnalysisRow } from '@/components/AnalysisRow';
import { ReportHeader, ReportTabs, headerCircle } from '@/components/report-sections';
import { Button, Card, Icon, Screen } from '@/components/ui';
import type { Analysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { deleteReportPdf } from '@/lib/cache';
import { matches, type ListFilter } from '@/lib/ui-logic';
import { color, radius, space, type as t } from '@/theme';

// 필터 결과가 0건일 때의 짧은 문구(분석이 1건 이상 있을 때만 쓰인다).
const FILTER_EMPTY: Record<ListFilter, string> = { all: '해당하는 분석이 없어요', done: '완료된 분석이 없어요', running: '진행 중인 분석이 없어요' };

// 블랙박스마다 방법이 달라 단정하지 않는다.
const FIND_TIPS = [
  '대부분 블랙박스 제조사 앱(와이파이 연결)에서 휴대폰으로 저장할 수 있어요',
  '메모리카드를 빼서 휴대폰이나 PC로 옮겨도 돼요',
  '사고 영상은 보통 "충격"이나 "이벤트" 폴더에 따로 저장돼요',
  '사고 앞뒤가 함께 담긴 2분 이하 영상이면 돼요',
  '원본 영상은 지우지 말고 보관해 두세요',
];
const STEPS = [
  { title: '영상 올리기', body: '사고 앞뒤가 담긴 2분 이하 영상' },
  { title: 'AI가 장면 분석', body: '분석이 끝나면 알림을 보내요' },
  { title: '리포트 받기', body: '과실 범위 · 근거 장면 · PDF' },
];

// 분석이 하나도 없을 때(ADR 0031): 무엇을 받는지 3단계로 알리고, 영상 찾는 법은 접어 둔다.
function EmptyGuide({ onUpload }: { onUpload: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={{ backgroundColor: color.ink, borderRadius: radius.card, padding: space[5], gap: space[1] }}>
        <Text accessibilityRole="header" style={[t.title, { fontSize: 21, color: color.white }]}>아직 분석한 사고가 없어요</Text>
        <Text style={[t.body, { color: color.brand400, lineHeight: 21 }]}>블랙박스 영상을 올리면 과실 범위와 근거 장면을 정리해 드려요.</Text>
        <Button label="영상 올리기" variant="onDark" icon="upload" onPress={onUpload} style={{ marginTop: space[3] }} />
      </View>
      <Card title="이렇게 진행돼요">
        {STEPS.map((st, i) => (
          <View key={st.title} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[t.label, { fontSize: 14, fontWeight: '800', color: color.mintDeep }]}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[t.body, { fontWeight: '700', color: color.gray12 }]}>{st.title}</Text>
              <Text style={[t.caption, { fontSize: 14, color: color.gray11 }]}>{st.body}</Text>
            </View>
          </View>
        ))}
      </Card>
      <View style={{ backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, paddingHorizontal: space[4] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="블랙박스 영상, 어떻게 찾나요?"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[2] }}
        >
          <Icon name="dashcam" size={18} color={color.mintDeep} />
          <Text style={[t.body, { flex: 1, fontWeight: '700', color: color.gray12 }]}>블랙박스 영상, 어떻게 찾나요?</Text>
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><Icon name="chevron" size={16} color={color.gray11} /></View>
        </Pressable>
        {open ? (
          <View style={{ gap: space[2], paddingBottom: space[4] }}>
            {FIND_TIPS.map((tip) => (
              <View key={tip} style={{ flexDirection: 'row', gap: space[2] }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: color.mintDeep }} />
                <Text style={[t.body, { flex: 1, fontSize: 14.5, lineHeight: 21, color: color.gray12 }]}>{tip}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}

const FILTERS: { value: ListFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'done', label: '완료' },
  { value: 'running', label: '진행 중' },
];

export default function AnalysesScreen() {
  const api = useApi();
  const router = useRouter();
  const [items, setItems] = useState<Analysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ListFilter>('all');

  // ponytail: 서버 최대 100건까지만 보여 준다. 더 쌓이면 offset으로 이어 받는다.
  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Analysis[] }>('/api/v1/analyses?limit=100')).items);
      setError(null);
    } catch (e) {
      setError((e as ApiFailure).message);
    }
  }, [api]);

  // 상세 화면에서 돌아올 때마다 다시 불러온다.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = items?.filter((a) => matches(filter, a.status)) ?? [];
  const running = items?.filter((a) => matches('running', a.status)).length ?? 0;
  const summary = items === null ? undefined : items.length === 0 ? '영상을 올리면 과실 범위를 알려드려요' : [`분석 ${items.length}건`, running ? `진행 중 ${running}건` : null].filter(Boolean).join(' · ');

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const remove = (id: number) =>
    Alert.alert('분석 삭제', '이 분석과 영상 파일을 지웁니다. 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/api/v1/analyses/${id}`, { method: 'DELETE' });
            deleteReportPdf(id);
            setItems((cur) => cur?.filter((a) => a.id !== id) ?? null);
          } catch (e) {
            const err = e as ApiFailure;
            if (err.status === 404) setItems((cur) => cur?.filter((a) => a.id !== id) ?? null); // 이미 지워졌다.
            else setError(err.message);
          }
        },
      },
    ]);

  return (
    <Screen scroll tabInset topColor={color.ink} barStyle="light-content" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {/* 리포트 화면과 같은 남색 머리글 + 흰 탭(ADR 0032). 개수는 머리글 아래 줄에 보인다. */}
      <ReportHeader
        title="내 분석"
        subtitle={summary}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="영상 올리기" onPress={() => router.push('/upload')} style={headerCircle}>
            <Icon name="upload" size={18} color={color.white} />
          </Pressable>
        }
      />
      {/* 분석이 0건이면 필터는 눌러도 바뀌는 게 없으니 숨긴다. */}
      {items?.length ? <ReportTabs options={FILTERS} value={filter} onChange={setFilter} /> : null}
      {error ? <Text style={{ ...t.caption, color: color.danger600 }}>{error}</Text> : null}
      {items === null ? (
        <Text style={{ ...t.body, color: color.gray11 }}>불러오는 중</Text>
      ) : items.length === 0 ? (
        <EmptyGuide onUpload={() => router.push('/upload')} />
      ) : (
        <>
          <View style={{ gap: space[2] }}>
              {shown.length ? (
                shown.map((a) => (
                  <AnalysisRow key={a.id} a={a} onPress={() => router.push(`/analyses/${a.id}`)} onDelete={() => remove(a.id)} />
                ))
              ) : (
                <Text style={{ ...t.body, color: color.gray11, textAlign: 'center', paddingVertical: space[4] }}>{FILTER_EMPTY[filter]}</Text>
              )}
            </View>
          <Button variant="secondary" icon="upload" label="영상 올리기" onPress={() => router.push('/upload')} />
        </>
      )}
    </Screen>
  );
}
