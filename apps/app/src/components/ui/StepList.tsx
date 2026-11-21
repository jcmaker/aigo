import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { color, space, type } from '@/theme';
import { Icon } from './Icon';

type Step = { title: string; detail?: string; time?: string };

// 끝난 단계의 체크는 튀어나오듯 나타난다.
function DoneDot({ still }: { still: boolean }) {
  const scale = useRef(new Animated.Value(still ? 1 : 0.4)).current;
  useEffect(() => {
    if (!still) Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 12 }).start();
  }, [scale, still]);
  return (
    <Animated.View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.brand, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
      <Icon name="check" size={16} color={color.onBrand} />
    </Animated.View>
  );
}

// 진행 중 단계: 번호 둘레를 링이 돈다. 동작 줄이기면 멈춘 링.
function ActiveDot({ n, still }: { n: number; still: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin, still]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: color.brand200, borderTopColor: color.brand, transform: [{ rotate }] }} />
      <Text style={[type.micro, { fontWeight: '800', color: color.ink }]}>{n}</Text>
    </View>
  );
}

// current 앞은 끝, current는 state를 따르고, 뒤는 대기. state가 done이면 모두 끝.
export function StepList({ steps, current, state, reduceMotion = false }: { steps: Step[]; current: number; state: 'running' | 'done' | 'failed'; reduceMotion?: boolean }) {
  return (
    <View style={{ gap: space[3] }}>
      {steps.map((s, i) => {
        const done = state === 'done' || i < current;
        const failed = state === 'failed' && i === current;
        const active = state === 'running' && i === current;
        const status = done ? '완료' : failed ? '실패' : active ? '진행 중' : '대기';
        return (
          // 읽기 문구에는 초를 넣지 않는다. 1초마다 다시 읽히지 않게.
          <View key={i} accessible accessibilityLabel={`${i + 1}단계 ${s.title} ${status}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            {done ? (
              <DoneDot still={reduceMotion} />
            ) : active ? (
              <ActiveDot n={i + 1} still={reduceMotion} />
            ) : (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: failed ? color.danger : color.gray4, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type.micro, { fontWeight: '800', color: failed ? color.white : color.ink }]}>{i + 1}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}>
                <Text style={[type.label, { color: done || active || failed ? color.gray12 : color.gray9 }]}>{s.title}</Text>
                {s.time ? <Text style={[type.label, { color: color.brand }]}>{s.time}</Text> : null}
              </View>
              {s.detail ? <Text style={[type.caption, { color: failed ? color.danger600 : active ? color.brand : color.gray11 }]}>{s.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
