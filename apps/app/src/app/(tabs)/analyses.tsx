import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';
import { AnalysisRow } from '@/components/AnalysisRow';
import { Button, Card, EmptyState, Icon, PageTitle, Screen, SectionTitle, SegmentedControl } from '@/components/ui';
import { circleButtonStyle } from '@/components/ui/TopBar';
import type { Analysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { deleteReportPdf } from '@/lib/cache';
import { matches, type ListFilter } from '@/lib/ui-logic';
import { color, space, type as t } from '@/theme';

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
    <Screen scroll tabInset refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <PageTitle
        title="내 분석"
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="영상 올리기" onPress={() => router.push('/upload')} style={circleButtonStyle}>
            <Icon name="upload" size={18} color={color.ink} />
          </Pressable>
        }
      />
      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      {error ? <Text style={{ ...t.caption, color: color.danger600 }}>{error}</Text> : null}
      {items === null ? (
        <Text style={{ ...t.body, color: color.gray11 }}>불러오는 중</Text>
      ) : (
        <>
          <SectionTitle title="분석 목록" meta={`${shown.length}건`} />
          {items.length === 0 ? (
            <Card>
              <EmptyState icon="video" title="아직 분석한 영상이 없어요">
                <Button label="영상 올리기" onPress={() => router.push('/upload')} />
              </EmptyState>
            </Card>
          ) : (
            <View style={{ gap: space[2] }}>
              {shown.length ? (
                shown.map((a) => (
                  <AnalysisRow key={a.id} a={a} onPress={() => router.push(`/analyses/${a.id}`)} onDelete={() => remove(a.id)} />
                ))
              ) : (
                <Text style={{ ...t.body, color: color.gray11, textAlign: 'center', paddingVertical: space[4] }}>해당하는 분석이 없어요</Text>
              )}
            </View>
          )}
          {items.length ? <Button variant="secondary" icon="upload" label="영상 올리기" onPress={() => router.push('/upload')} /> : null}
        </>
      )}
    </Screen>
  );
}
