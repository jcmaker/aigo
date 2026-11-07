import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Button, ErrorText, styles } from '@/components/ui';
import { STATUS_LABEL, analysisTitle, faultRange, seoulDate, type Analysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { deleteReportPdf } from '@/lib/cache';

export default function AnalysesScreen() {
  const api = useApi();
  const router = useRouter();
  const [items, setItems] = useState<Analysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    <View style={{ flex: 1 }}>
      <FlatList
        data={items ?? []}
        keyExtractor={(a) => String(a.id)}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={{ padding: 24, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={styles.title}>내 분석</Text>
            <ErrorText>{error}</ErrorText>
          </View>
        }
        ListEmptyComponent={
          items ? (
            <View style={{ gap: 12 }}>
              <Text>아직 분석한 영상이 없습니다.</Text>
              <Button label="영상 올리기" onPress={() => router.push('/upload')} />
            </View>
          ) : (
            <Text>불러오는 중</Text>
          )
        }
        renderItem={({ item: a }) => (
          <View style={{ gap: 6, borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 12 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/analyses/${a.id}`)} style={{ gap: 2 }}>
              <Text style={{ color: '#666' }}>
                #{a.id} · {seoulDate(a.created_at)} · {STATUS_LABEL[a.status] ?? STATUS_LABEL.processing}
              </Text>
              <Text style={{ fontWeight: '600' }}>{analysisTitle(a)}</Text>
              {a.report?.fault ? <Text>내 과실 {faultRange(a.report.fault)}</Text> : null}
            </Pressable>
            <Button label="삭제" secondary onPress={() => remove(a.id)} />
          </View>
        )}
      />
    </View>
  );
}
