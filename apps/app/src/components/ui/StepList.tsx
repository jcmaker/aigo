import { Text, View } from 'react-native';
import { color, space, type } from '@/theme';
import { Icon } from './Icon';

// current 앞은 끝, current는 state를 따르고, 뒤는 대기. state가 done이면 모두 끝.
export function StepList({ steps, current, state }: { steps: { title: string; detail?: string }[]; current: number; state: 'running' | 'done' | 'failed' }) {
  return (
    <View style={{ gap: space[3] }}>
      {steps.map((s, i) => {
        const done = state === 'done' || i < current;
        const failed = state === 'failed' && i === current;
        const active = state === 'running' && i === current;
        const status = done ? '완료' : failed ? '실패' : active ? '진행 중' : '대기';
        const bg = done ? color.brand : failed ? color.danger : active ? color.brand400 : color.gray4;
        return (
          <View key={i} accessible accessibilityLabel={`${i + 1}단계 ${s.title} ${status}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
              {done ? <Icon name="check" size={16} color={color.ink} /> : <Text style={[type.micro, { fontWeight: '800', color: failed ? color.white : color.ink }]}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { color: done || active || failed ? color.gray12 : color.gray9 }]}>{s.title}</Text>
              {s.detail ? <Text style={[type.caption, { color: failed ? color.danger600 : color.gray11 }]}>{s.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
