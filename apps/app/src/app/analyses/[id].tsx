import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Pressable, Text, type ScrollViewInstance, type ViewInstance } from 'react-native';
import { ErrorLine, FailureNotice, ProgressView, ReportView, type ReportTab } from '@/components/analysis';
import { Button, Card, Icon, Screen } from '@/components/ui';
import { ReportHeader, ReportMenu, headerCircle, type MenuAction, type MenuAnchor } from '@/components/report-sections';
import { analysisTitle, seoulDate, useAnalysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { shareReportPdf } from '@/lib/share-report';
import { deleteReportPdf } from '@/lib/cache';
import { color, space, type } from '@/theme';

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const { analysis, notFound, stale, stop, reload } = useAnalysis(id);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const menuRef = useRef<ViewInstance>(null);
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
  const subtitle = analysis ? [tabbed ? (report.involvement === 'party' ? '내 차 사고' : '제3자 사고') : null, seoulDate(analysis.created_at), analysis.source === 'dashpi' ? 'DashPi' : null].filter(Boolean).join(' · ') : undefined;
  // 오른쪽 위 "더 보기": 공유·다시 올리기·삭제를 글자로 된 메뉴에 모은다. 분석 중에는 다시 올리기를 숨긴다.
  const busy = analysis?.status === 'queued' || analysis?.status === 'processing';
  const actions: MenuAction[] = analysis
    ? [
        ...(report ? [{ label: '리포트 PDF로 보내기', icon: 'file' as const, onPress: share, disabled: sharing }] : []),
        ...(!busy ? [{ label: '영상 다시 올리기', icon: 'upload' as const, onPress: () => router.dismissTo('/upload') }] : []),
        { label: '분석 삭제', icon: 'trash' as const, onPress: remove, danger: true, disabled: deleting },
      ]
    : [];
  // ⋯ 버튼의 화면 위치를 재서 메뉴 상자를 바로 아래 오른쪽 끝에 맞춘다.
  const openMenu = () =>
    menuRef.current?.measureInWindow((x, y, w, h) => setMenu({ top: y + h + 6, right: Math.max(space[2], Dimensions.get('window').width - (x + w)) }));
  const menuButton = analysis ? (
    <Pressable ref={menuRef} accessibilityRole="button" accessibilityLabel="더 보기" accessibilityHint="리포트 PDF 보내기, 영상 다시 올리기, 분석 삭제" onPress={openMenu} style={headerCircle}>
      {sharing || deleting ? <ActivityIndicator color={color.white} /> : <Icon name="dots" size={20} color={color.white} />}
    </Pressable>
  ) : undefined;

  return (
    <Screen scroll scrollRef={scroll} background={color.reportBg} topColor={color.ink} barStyle="light-content">
      <Stack.Screen options={{ headerShown: false }} />
      <ReportHeader title={analysis ? analysisTitle(analysis) : `분석 #${id}`} subtitle={subtitle} onBack={back} right={menuButton} />
      <ReportMenu visible={menu !== null} anchor={menu} actions={actions} onClose={() => setMenu(null)} />
      {analysis ? (
        <>
          {/* 출처(DashPi)는 머리글 날짜 줄에 붙인다. 머리글과 탭 사이를 비워 두기 위해서다. */}
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
          {/* 실패했을 때는 다시 올리기를 본문에도 크게 둔다. 삭제·공유는 오른쪽 위 메뉴에 있다. */}
          {analysis.status !== 'queued' && analysis.status !== 'processing' && analysis.status !== 'done' ? (
            <Button label="영상 다시 올리기" onPress={() => router.dismissTo('/upload')} />
          ) : null}
        </>
      ) : notFound ? null : (
        <Text style={[type.body, { color: color.gray11 }]}>불러오는 중</Text>
      )}
    </Screen>
  );
}
