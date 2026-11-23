import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, RefreshControl, Text, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalysisRow } from '@/components/AnalysisRow';
import { FindVideoTips } from '@/components/FindVideoTips';
import { ReportHeader, ReportMenu, ReportTabs, headerCircle, type MenuAction, type MenuAnchor } from '@/components/report-sections';
import { Button, Card, Icon, Screen, useConfirm } from '@/components/ui';
import type { Analysis } from '@/lib/analysis';
import { useApi } from '@/lib/api';
import type { ApiFailure } from '@/lib/api';
import { deleteReportPdf } from '@/lib/cache';
import { deletable, matches, type ListFilter } from '@/lib/ui-logic';
import { color, radius, space, tabBarSpace, type as t } from '@/theme';

// 필터 결과가 0건일 때의 짧은 문구(분석이 1건 이상 있을 때만 쓰인다).
const FILTER_EMPTY: Record<ListFilter, string> = { all: '해당하는 분석이 없어요', done: '완료된 분석이 없어요', running: '진행 중인 분석이 없어요' };

const STEPS = [
  { title: '영상 올리기', body: '사고 앞뒤가 담긴 2분 이하 영상' },
  { title: 'AI가 장면 분석', body: '분석이 끝나면 알림을 보내요' },
  { title: '리포트 받기', body: '과실 범위 · 근거 장면 · PDF' },
];

// 분석이 하나도 없을 때(ADR 0031): 무엇을 받는지 3단계로 알리고, 영상 찾는 법은 접어 둔다.
function EmptyGuide({ onUpload }: { onUpload: () => void }) {
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
      <FindVideoTips />
    </>
  );
}

// "진행 중" 탭은 뺐다(ADR 0043): 분석은 몇 분이면 끝나 거의 늘 비어 있고, 머리글 아래 줄("진행 중 1건")과 전체 목록 맨 위에서 이미 보인다.
const FILTERS: { value: ListFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'done', label: '완료' },
];

export default function AnalysesScreen() {
  const api = useApi();
  const router = useRouter();
  const [items, setItems] = useState<Analysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ListFilter>('all');
  const [ask, dialog] = useConfirm();
  // 여러 개 지우기(ADR 0043): 위 ⋯ → "선택해서 지우기"면 고르는 모드, "모두 지우기"면 지금 탭의 분석을 한 번에.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const menuRef = useRef<ViewInstance>(null);
  const insets = useSafeAreaInsets();

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

  // 하나씩 서버에 지우기를 보낸다(여러 개 지우기 API가 없다). 이미 지워진 것(404)은 지운 것으로 친다.
  const removeMany = async (ids: number[]) => {
    setDeleting(true);
    const gone: number[] = [];
    let failed = 0;
    for (const id of ids) {
      try {
        await api(`/api/v1/analyses/${id}`, { method: 'DELETE' });
        deleteReportPdf(id);
        gone.push(id);
      } catch (e) {
        if ((e as ApiFailure).status === 404) gone.push(id);
        else failed += 1;
      }
    }
    setItems((cur) => cur?.filter((a) => !gone.includes(a.id)) ?? null);
    setError(failed ? `${failed}건은 지우지 못했어요. 잠시 뒤 다시 해 주세요.` : null);
    setDeleting(false);
    setSelecting(false);
    setPicked(new Set());
  };
  const askMany = (ids: number[], title: string) =>
    ask({ title, body: '분석과 영상 파일을 지워요. 되돌릴 수 없어요.', confirmLabel: `${ids.length}건 삭제`, danger: true, icon: 'trash', onConfirm: () => removeMany(ids) });

  const remove = (id: number) =>
    ask({
      title: '분석을 지울까요?',
      body: '이 분석과 영상 파일을 지워요. 되돌릴 수 없어요.',
      confirmLabel: '삭제',
      danger: true,
      icon: 'trash',
      onConfirm: async () => {
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
    });

  const canDelete = shown.filter((a) => deletable(a.status));
  const allLabel = filter === 'done' ? '완료된 분석 모두 지우기' : '모두 지우기';
  const menuActions: MenuAction[] = [
    { label: '선택해서 지우기', icon: 'check', onPress: () => { setSelecting(true); setPicked(new Set()); } },
    { label: allLabel, icon: 'trash', danger: true, disabled: !canDelete.length, onPress: () => askMany(canDelete.map((a) => a.id), filter === 'done' ? `완료된 분석 ${canDelete.length}건을 모두 지울까요?` : `분석 ${canDelete.length}건을 모두 지울까요?`) },
  ];
  const openMenu = () =>
    menuRef.current?.measureInWindow((x, y, w, h) => setMenu({ top: y + h + 6, right: Math.max(space[2], Dimensions.get('window').width - (x + w)) }));
  // 분석이 있을 때만 ⋯를 둔다. 고르는 중에는 ⋯를 숨기고 아래 막대의 취소로 빠져나온다.
  const menuButton = items?.length && !selecting ? (
    <Pressable ref={menuRef} accessibilityRole="button" accessibilityLabel="더 보기" accessibilityHint="선택해서 지우기, 모두 지우기" onPress={openMenu} style={headerCircle}>
      {deleting ? <ActivityIndicator color={color.white} /> : <Icon name="dots" size={20} color={color.white} />}
    </Pressable>
  ) : undefined;
  const toggle = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const barBottom = insets.bottom + tabBarSpace + 6;

  return (
    <View style={{ flex: 1 }}>
    <Screen scroll tabInset topColor={color.ink} barStyle="light-content" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {/* 리포트 화면과 같은 남색 머리글 + 흰 탭(ADR 0032). 개수는 머리글 아래 줄에 보인다. */}
      {/* 영상 올리기는 하단 메뉴 "분석하기"와 화면 안 버튼으로 충분해 머리글 버튼은 두지 않는다(ADR 0032). */}
      <ReportHeader title={selecting ? `${picked.size}개 선택됨` : '내 분석'} subtitle={selecting ? '지울 분석을 눌러 고르세요' : summary} right={menuButton} />
      <ReportMenu visible={menu !== null} anchor={menu} actions={menuActions} onClose={() => setMenu(null)} />
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
                  <AnalysisRow
                    key={a.id}
                    a={a}
                    select={selecting ? { checked: picked.has(a.id), disabled: !deletable(a.status) } : undefined}
                    onPress={() => (selecting ? toggle(a.id) : router.push(`/analyses/${a.id}`))}
                    onDelete={() => remove(a.id)}
                  />
                ))
              ) : (
                <Text style={{ ...t.body, color: color.gray11, textAlign: 'center', paddingVertical: space[4] }}>{FILTER_EMPTY[filter]}</Text>
              )}
            </View>
          {selecting ? <View style={{ height: 72 }} /> : <Button variant="secondary" icon="upload" label="영상 올리기" onPress={() => router.push('/upload')} />}
        </>
      )}
    </Screen>
      {/* 고르는 중에는 엄지가 닿는 아래에 취소·지우기를 고정한다(하단 메뉴 바로 위). */}
      {selecting ? (
        <View style={{ position: 'absolute', left: space[4], right: space[4], bottom: barBottom, flexDirection: 'row', gap: space[2] }}>
          <Button variant="secondary" label="취소" onPress={() => { setSelecting(false); setPicked(new Set()); }} style={{ flex: 1 }} />
          <Button
            variant="emergency"
            icon="trash"
            label={picked.size ? `${picked.size}개 지우기` : '지울 분석 고르기'}
            disabled={!picked.size || deleting}
            onPress={() => askMany([...picked], `분석 ${picked.size}건을 지울까요?`)}
            style={{ flex: 2 }}
          />
        </View>
      ) : null}
      {dialog}
    </View>
  );
}
