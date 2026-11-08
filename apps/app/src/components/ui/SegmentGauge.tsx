import { View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import type { Seg } from '@/lib/ui-logic';
import { color } from '@/theme';

// 시안(design-system-v3)과 같은 기하: 반지름 96~134, 칸 사이 0.13rad
const CX = 150, CY = 150, R1 = 96, R2 = 134, GAP = 0.13;
const fill: Record<Seg, string> = { on: color.brand, soft: color.brand400, off: color.gray4 };
const pt = (r: number, a: number) => `${CX + r * Math.cos(a)},${CY + r * Math.sin(a)}`;

export function SegmentGauge({ segments, label, value, valueSize = 36 }: { segments: Seg[]; label: string; value: string; valueSize?: number }) {
  const n = segments.length;
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={{ alignSelf: 'center', width: '100%', maxWidth: 300, aspectRatio: 300 / 170 }}>
      <Svg width="100%" height="100%" viewBox="0 0 300 170">
        {segments.map((s, i) => {
          const a0 = Math.PI + (i / n) * Math.PI + GAP / 2;
          const a1 = Math.PI + ((i + 1) / n) * Math.PI - GAP / 2;
          return (
            <Path
              key={i}
              d={`M${pt(R2, a0)} A${R2},${R2} 0 0 1 ${pt(R2, a1)} L${pt(R1, a1)} A${R1},${R1} 0 0 0 ${pt(R1, a0)} Z`}
              fill={fill[s]} stroke={fill[s]} strokeWidth={9} strokeLinejoin="round"
            />
          );
        })}
        <SvgText x={150} y={118} textAnchor="middle" fontSize={13} fill={color.gray11}>{label}</SvgText>
        <SvgText x={150} y={156} textAnchor="middle" fontSize={valueSize} fontWeight="800" fill={color.gray12} letterSpacing={-1}>{value}</SvgText>
      </Svg>
    </View>
  );
}
