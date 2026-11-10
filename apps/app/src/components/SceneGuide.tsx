import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, TextInput, View } from 'react-native';
import { CrashSign } from '@/components/CrashSign';
import { Button, Card, Icon, type IconName } from '@/components/ui';
import {
  askedQuestions, buildGuide, nextQuestion, QUESTIONS, setAnswer, totalQuestions,
  type Answers, type Notes, type GuideAction, type GuideStep, type Option, type Question,
} from '@/lib/scene-guide';
import { color, radius, space, type } from '@/theme';

export type GuideHandlers = Record<GuideAction, () => void>;
const ACTION_LOOK: Record<GuideAction, { label: string; icon: IconName }> = {
  call112: { label: '112 전화', icon: 'phone' },
  call119: { label: '119 전화', icon: 'phone' },
  callEx: { label: '도로공사 1588-2504', icon: 'tow' },
  insurer: { label: '보험사 전화', icon: 'phone' },
  photo: { label: '현장 사진 촬영', icon: 'camera' },
};

// 질문 카드는 파랑과 하늘색 사이의 차분한 색(sceneCard)으로, 화면을 열면 바로 눈에 들어오되 쨍하지 않게 한다.
// 카드 위 글자와 아이콘은 흰색으로 쓴다.
const ON_CARD = color.white;
const ON_DARK_SUB = 'rgba(255,255,255,0.92)';

// 눈이 편하도록 강한 빨강은 쓰지 않고 연한 바탕 + 진한 아이콘으로만 강조한다.
function Tile({ icon, tone = 'plain', size = 40 }: { icon: IconName; tone?: 'plain' | 'urgent' | 'urgentOnPink' | 'done'; size?: number }) {
  const bg = { plain: color.gray3, urgent: color.danger300, urgentOnPink: color.white, done: color.brand }[tone];
  const fg = { plain: color.gray12, urgent: color.danger600, urgentOnPink: color.danger600, done: color.onBrand }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: radius.icon, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.5} color={fg} />
    </View>
  );
}

// 한 줄 답 상자: 흰 바탕에 검은 아이콘과 글자. bare면 아이콘을 틀 없이 크게 둔다.
function OptionButton({ o, bare, selected, onPress }: { o: Option; bare?: boolean; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={o.label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: space[3], padding: space[3] + 2, borderRadius: radius.row,
        backgroundColor: pressed || selected ? color.brand200 : color.white,
      })}
    >
      {bare ? <Icon name={o.icon} size={34} color={color.gray12} /> : <Tile icon={o.icon} tone={o.danger ? 'urgent' : 'plain'} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { fontSize: 16, fontWeight: '700', color: color.gray12 }]}>{o.label}</Text>
        {o.sub ? <Text style={[type.caption, { color: color.gray11 }]}>{o.sub}</Text> : null}
      </View>
      <Icon name="chevron" size={16} color={color.gray9} />
    </Pressable>
  );
}

// 격자 칸(무엇과 부딪혔나요): 왼쪽 위 아이콘 틀, 오른쪽 위 > 동그라미, 굵은 이름과 설명 한 줄.
// 고른 칸은 연한 하늘색이 되고 오른쪽 아래에 큰 아이콘 그림이 흐리게 깔린다.
function GridOption({ o, selected, onPress }: { o: Option; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={o.label} accessibilityState={{ selected: !!selected }} onPress={onPress}
      style={({ pressed }) => ({ width: '48.5%', minHeight: 132, overflow: 'hidden', borderRadius: radius.row, padding: space[3] + 2, gap: space[3], backgroundColor: pressed || selected ? color.brand200 : color.white })}>
      {({ pressed }) => (
        <>
          {pressed || selected ? (
            <View pointerEvents="none" style={{ position: 'absolute', right: -14, bottom: -14 }}><Icon name={o.icon} size={86} color={color.brand400} /></View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Tile icon={o.icon} size={46} />
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.gray3, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevron" size={14} color={color.gray11} />
            </View>
          </View>
          <View style={{ gap: 2 }}>
            <Text style={[type.headline, { fontSize: 17, fontWeight: '800', color: color.gray12 }]}>{o.label}</Text>
            {o.sub ? <Text style={[type.caption, { color: color.gray11 }]}>{o.sub}</Text> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

// 기타를 고르면 열리는 글 입력칸. 비워도 넘어갈 수 있다(급한 상황이라 막지 않는다).
function OtherInput({ hint, onDone }: { hint: string; onDone: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
        <TextInput
          accessibilityLabel="기타 내용"
          autoFocus
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => onDone(text.trim())}
          returnKeyType="done"
          placeholder="여기에 적어 주세요"
          placeholderTextColor={color.gray9}
          style={[type.body, { flex: 1, minWidth: 0, width: 0, height: 52, borderRadius: radius.input, paddingHorizontal: space[4], backgroundColor: color.white, color: color.gray12 }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="다음" onPress={() => onDone(text.trim())}
          style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: color.white, opacity: pressed ? 0.85 : 1, alignItems: 'center', justifyContent: 'center' })}>
          <Icon name="arrow" size={24} color={color.sceneCard} />
        </Pressable>
      </View>
      <Text style={[type.micro, { color: ON_DARK_SUB }]}>{hint}</Text>
    </View>
  );
}

function QuestionCard({ q, step, total, onAnswer, onBack }: { q: Question; step: number; total: number; onAnswer: (v: string, note?: string) => void; onBack?: () => void }) {
  const [typing, setTyping] = useState<Option | null>(null);
  useEffect(() => setTyping(null), [q.id]);
  // 카드가 바뀔 때 옆에서 부드럽게 들어온다.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [q.id, anim]);
  const pct = Math.min(1, step / total);
  const slide = { opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] };
  if (q.id === 'help') {
    // 첫 카드: 표지판 그림 + 한 줄 안내 + 오른쪽 아래 화살표로 시작한다.
    return (
      <Animated.View style={slide}>
        <View style={{ backgroundColor: color.sceneCard, borderRadius: radius.card, padding: space[5], gap: space[3] }}>
          <View style={{ alignItems: 'center', paddingVertical: space[2] }}><CrashSign size={186} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[3] }}>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text accessibilityRole="header" style={[type.title, { fontSize: 22, color: ON_CARD }]}>{q.title}</Text>
              {q.sub ? <Text numberOfLines={1} adjustsFontSizeToFit style={[type.body, { fontSize: 14, color: ON_DARK_SUB }]}>{q.sub}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="시작하기" onPress={() => onAnswer(q.options[0].value)} hitSlop={8}
              style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 30, backgroundColor: color.white, opacity: pressed ? 0.85 : 1, alignItems: 'center', justifyContent: 'center' })}>
              <Icon name="arrow" size={28} color={color.sceneCard} />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={slide}>
      <View style={{ backgroundColor: color.sceneCard, borderRadius: radius.card, padding: space[5], gap: space[4] }}>
        {/* 머리줄: 왼쪽 뒤로, 가운데 제목, 오른쪽 단계 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 28 }}>
          <View style={{ width: 48 }}>
            {onBack ? (
              <Pressable accessibilityRole="button" accessibilityLabel="이전 질문" onPress={onBack} hitSlop={12}>
                <Icon name="back" size={22} color={ON_CARD} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[type.headline, { flex: 1, textAlign: 'center', color: ON_CARD }]}>사고 안내</Text>
          <Text style={[type.label, { width: 48, textAlign: 'right', fontSize: 15, color: ON_DARK_SUB }]}>{step} / {total}</Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' }}>
          <View style={{ width: `${pct * 100}%`, height: 4, borderRadius: 2, backgroundColor: color.white }} />
        </View>
        <View style={{ gap: space[1], marginTop: space[1] }}>
          <Text accessibilityRole="header" style={[type.title, { fontSize: 26, color: ON_CARD }]}>{q.title}</Text>
          {q.sub ? <Text style={[type.body, { color: ON_DARK_SUB, lineHeight: 21 }]}>{q.sub}</Text> : null}
        </View>
        <View style={q.grid ? { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'stretch', rowGap: space[2] } : { gap: space[2] }}>
          {q.options.map((o) => q.grid ? (
            <GridOption key={o.value} o={o} selected={typing?.value === o.value} onPress={() => (o.input ? setTyping(o) : onAnswer(o.value))} />
          ) : (
            <OptionButton key={o.value} o={o} bare={q.bare} selected={typing?.value === o.value}
              onPress={() => (o.input ? setTyping(o) : onAnswer(o.value))} />
          ))}
        </View>
        {typing?.input ? <OtherInput key={typing.value} hint={typing.input} onDone={(t) => onAnswer(typing.value, t)} /> : null}
      </View>
    </Animated.View>
  );
}

function StepRow({ n, step, done, open, onToggleDone, onToggleOpen, handlers, last }: {
  n?: number; step: GuideStep; done?: boolean; open: boolean; onToggleDone?: () => void; onToggleOpen: () => void; handlers: GuideHandlers; last: boolean;
}) {
  const hot = step.urgent && !done;
  const tone = done ? 'done' : hot ? 'urgentOnPink' : 'plain';
  const tile = <Tile icon={done ? 'check' : step.icon} tone={tone} size={44} />;
  return (
    // 중요한 단계는 줄 전체를 연분홍 상자로 감싼다.
    <View style={[{ flexDirection: 'row', gap: space[3] }, hot ? { backgroundColor: color.danger300, borderRadius: radius.row, padding: space[2], marginHorizontal: -space[2], marginBottom: space[2] } : null]}>
      <View style={{ alignItems: 'center' }}>
        {onToggleDone ? (
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`${n}단계 ${step.title} 완료`} accessibilityState={{ checked: !!done }} onPress={onToggleDone} hitSlop={4}>{tile}</Pressable>
        ) : tile}
        {last || hot ? null : <View style={{ flex: 1, width: 2, minHeight: 10, backgroundColor: color.gray3, marginVertical: 4 }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last || hot ? 0 : space[3] }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${step.title}, ${open ? '접기' : '자세히'}`} onPress={onToggleOpen}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space[2] }}>
          {n ? <Text style={[type.micro, { color: color.gray9, width: 14 }]}>{n}</Text> : null}
          <Text style={[type.label, { flex: 1, fontSize: 15, fontWeight: '700', color: done ? color.gray9 : color.gray12, textDecorationLine: done ? 'line-through' : 'none' }]}>{step.title}</Text>
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><Icon name="chevron" size={14} color={color.gray9} /></View>
        </Pressable>
        {open ? (
          <View style={{ gap: space[3], marginTop: space[1] }}>
            <Text style={[type.body, { fontSize: 14, color: color.gray11, lineHeight: 21 }]}>{step.detail}</Text>
            {step.actions?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {step.actions.map((a) => (
                  <Button key={a} label={ACTION_LOOK[a].label} icon={ACTION_LOOK[a].icon} size="md" variant={a === 'call119' && step.urgent ? 'emergency' : 'secondary'} onPress={handlers[a]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// 사고 현장 모드: 질문 카드에 하나씩 답하면, 상황에 맞는 지금 할 일과 사고 뒤 할 일을 모아 보여 준다.
export function SceneGuide({ handlers }: { handlers: GuideHandlers }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [notes, setNotes] = useState<Notes>({});
  const [done, setDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const q = nextQuestion(answers);
  const asked = askedQuestions(answers);
  const back = () => {
    const last = asked[asked.length - 1];
    if (!last) return;
    const prev = { ...answers };
    delete prev[last];
    setAnswers(prev);
  };

  if (q) {
    return <QuestionCard q={QUESTIONS[q]} step={asked.length} total={totalQuestions(answers) - 1} onBack={asked.length ? back : undefined}
      onAnswer={(v, note) => {
        setAnswers(setAnswer(answers, q, v));
        if (q === 'kind' || q === 'how' || q === 'surface') setNotes((n) => ({ ...n, [q]: note || undefined }));
      }} />;
  }

  const guide = buildGuide(answers, notes);
  const doneCount = guide.now.filter((s) => done.has(s.id)).length;
  const toggle = (id: string) => setDone((d) => { const n = new Set(d); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const restart = () => { setAnswers({}); setNotes({}); setDone(new Set()); setOpen(null); };

  return (
    <>
      <View style={{ backgroundColor: color.white, borderRadius: radius.card, padding: space[4], gap: space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {guide.summary.map((t) => (
            <View key={t} style={{ backgroundColor: color.gray3, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 6 }}>
              <Text style={[type.label, { color: color.gray12 }]}>{t}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.caption, { color: color.gray11 }]}>이 상황에 맞춰 안내해요.</Text>
          <Pressable accessibilityRole="button" onPress={restart} hitSlop={10}><Text style={[type.label, { color: color.brand600 }]}>다시 답하기</Text></Pressable>
        </View>
      </View>

      <Card title="지금 할 일" action={{ label: `${doneCount}/${guide.now.length} 완료`, onPress: () => setDone(new Set()) }}>
        <View>
          {guide.now.map((s, i) => (
            <StepRow key={s.id} n={i + 1} step={s} done={done.has(s.id)} open={open === s.id} last={i === guide.now.length - 1} handlers={handlers}
              onToggleDone={() => toggle(s.id)} onToggleOpen={() => setOpen(open === s.id ? null : s.id)} />
          ))}
        </View>
        <Text style={[type.micro, { color: color.gray9 }]}>아이콘을 누르면 완료로 표시돼요. 제목을 누르면 자세한 방법이 열려요.</Text>
      </Card>

      {guide.later.length ? (
        <Card title="사고 뒤 할 일">
          <View>
            {guide.later.map((s, i) => (
              <StepRow key={s.id} step={s} open={open === s.id} last={i === guide.later.length - 1} handlers={handlers} onToggleOpen={() => setOpen(open === s.id ? null : s.id)} />
            ))}
          </View>
        </Card>
      ) : null}
    </>
  );
}
