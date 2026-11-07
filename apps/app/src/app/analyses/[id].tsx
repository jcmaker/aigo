import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { FailureNotice, ProgressView, ReportView } from '@/components/analysis';
import { Button, ErrorText } from '@/components/ui';
import { useAnalysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { shareReportPdf } from '@/lib/share-report';
import { deleteReportPdf } from '@/lib/cache';

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const { analysis, notFound, stale, stop, reload } = useAnalysis(id);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다른 기기에서 지워졌으면 알리고 목록으로 돌아간다. 폴링은 이미 멈췄다.
  useEffect(() => {
    if (notFound === null) return;
    Alert.alert('분석을 찾을 수 없습니다', notFound, [{ text: '확인', onPress: () => router.replace('/analyses') }]);
  }, [notFound, router]);

  const share = async () => {
    if (!analysis?.report) return;
    setSharing(true);
    setError(null);
    try {
      await shareReportPdf(analysis.report, analysis.created_at, analysis.id);
    } catch {
      setError('PDF를 공유하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setSharing(false);
    }
  };

  const remove = () =>
    Alert.alert('분석 삭제', '이 분석과 영상 파일을 지웁니다. 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          stop(); // 삭제 뒤 도착한 폴링의 404가 알림을 띄우지 않게 한다.
          setDeleting(true);
          setError(null);
          try {
            await api(`/api/v1/analyses/${id}`, { method: 'DELETE' });
            deleteReportPdf(id);
            router.replace('/analyses');
          } catch (e) {
            setError((e as ApiFailure).message);
            setDeleting(false);
            reload();
          }
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Stack.Screen options={{ title: `분석 #${id}` }} />
      {analysis ? (
        <>
          {analysis.status === 'done' && analysis.report ? <Button label="PDF로 공유" disabled={sharing} onPress={share} /> : null}
          <Button label="분석 삭제" secondary disabled={deleting} onPress={remove} />
          <ErrorText>{error}</ErrorText>
          {analysis.status !== 'done' ? (
            <ProgressView analysis={analysis} stale={stale} />
          ) : analysis.report ? (
            <ReportView analysis={analysis} onReload={reload} />
          ) : (
            <FailureNotice code="REPORT_MISSING" message="분석은 끝났지만 레포트가 없습니다. 영상을 다시 올려 주세요." />
          )}
          {analysis.status !== 'queued' && analysis.status !== 'processing' && analysis.status !== 'done' ? (
            <Button label="영상 다시 올리기" onPress={() => router.replace('/upload')} />
          ) : null}
        </>
      ) : notFound ? null : (
        <Text>불러오는 중</Text>
      )}
    </ScrollView>
  );
}
