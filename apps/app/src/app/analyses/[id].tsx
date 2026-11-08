import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, type ScrollViewInstance } from 'react-native';
import { ErrorLine, FailureNotice, ProgressView, ReportView, type ReportTab } from '@/components/analysis';
import { Button, Card, Icon, Screen, TopBar, SourceChip } from '@/components/ui';
import { circleButtonStyle } from '@/components/ui/TopBar';
import { analysisTitle, seoulDate, useAnalysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { shareReportPdf } from '@/lib/share-report';
import { deleteReportPdf } from '@/lib/cache';
import { color, type } from '@/theme';

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const { analysis, notFound, stale, stop, reload } = useAnalysis(id);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ReportTab>('summary');
  const scroll = useRef<ScrollViewInstance>(null);
  // 탭을 바꾸면 맨 위로 올린다. 요약 맨 아래의 시각을 눌러도 근거 탭의 영상이 보인다.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [tab]);

  // 다른 기기에서 지워졌으면 알리고 목록으로 돌아간다. 폴링은 이미 멈췄다.
  // 목록·업로드로 갈 때는 dismissTo로 아래의 탭 묶음까지 내려간다(replace는 탭 묶음을 하나 더 쌓는다).
  useEffect(() => {
    if (notFound === null) return;
    Alert.alert('분석을 찾을 수 없습니다', notFound, [{ text: '확인', onPress: () => router.dismissTo('/analyses') }]);
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
            router.dismissTo('/analyses');
          } catch (e) {
            setError((e as ApiFailure).message);
            setDeleting(false);
            reload();
          }
        },
      },
    ]);

  // 알림으로 바로 열면 뒤로 갈 화면이 없다.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/analyses'));
  const report = analysis?.status === 'done' ? analysis.report : null;
  const tabbed = !!report && report.involvement !== 'none';
  const subtitle = analysis ? [tabbed ? (report.involvement === 'party' ? '내 차 사고' : '제3자 사고') : null, seoulDate(analysis.created_at)].filter(Boolean).join(' · ') : undefined;
  const shareButton = report ? (
    <Pressable accessibilityRole="button" accessibilityLabel="PDF로 공유" accessibilityState={{ disabled: sharing }} disabled={sharing} onPress={share} style={circleButtonStyle}>
      {sharing ? <ActivityIndicator color={color.ink} /> : <Icon name="share" size={16} color={color.ink} />}
    </Pressable>
  ) : undefined;

  return (
    <Screen scroll scrollRef={scroll}>
      <Stack.Screen options={{ headerShown: false }} />
      <TopBar title={analysis ? analysisTitle(analysis) : `분석 #${id}`} subtitle={subtitle} onBack={back} right={shareButton} />
      {analysis ? (
        <>
          <SourceChip source={analysis.source} />
          <ErrorLine>{error}</ErrorLine>
          {analysis.status !== 'done' ? (
            <ProgressView analysis={analysis} stale={stale} />
          ) : analysis.report ? (
            <ReportView analysis={analysis} onReload={reload} tab={tab} onTab={setTab} />
          ) : (
            <Card>
              <FailureNotice code="REPORT_MISSING" message="분석은 끝났지만 레포트가 없습니다. 영상을 다시 올려 주세요." />
            </Card>
          )}
          {analysis.status !== 'queued' && analysis.status !== 'processing' && analysis.status !== 'done' ? (
            <Button label="영상 다시 올리기" onPress={() => router.dismissTo('/upload')} />
          ) : null}
          {/* 레포트 탭이 있으면 삭제는 기준 탭 맨 아래에 둔다. 오류는 맨 위와 버튼 바로 위에 모두 보인다. */}
          {!tabbed || tab === 'basis' ? (
            <>
              <ErrorLine>{error}</ErrorLine>
              <Button label="분석 삭제" variant="danger" icon="trash" disabled={deleting} onPress={remove} />
            </>
          ) : null}
        </>
      ) : notFound ? null : (
        <Text style={[type.body, { color: color.gray11 }]}>불러오는 중</Text>
      )}
    </Screen>
  );
}
