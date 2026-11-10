import Svg, { G, Path, Circle } from 'react-native-svg';

// 사고 다발 구간 표지판 느낌의 그림: 노란 삼각 표지 안에서 두 차가 부딪힌다. 눈이 편하도록 채도를 낮춘 색을 쓴다.
const SIGN_FILL = '#FFE39A';
const SIGN_EDGE = '#E2694F';
const CAR = '#26395E';

function Car({ x, y, angle, flip }: { x: number; y: number; angle: number; flip?: boolean }) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle}) scale(${flip ? -1 : 1} 1)`}>
      <Path d="M-15 0 L-10 -8 H4 L10 0 Z" fill={CAR} />
      <Path d="M-17 0 H15 a2 2 0 0 1 2 2 V7 a2 2 0 0 1 -2 2 H-17 a2 2 0 0 1 -2 -2 V2 a2 2 0 0 1 2 -2 Z" fill={CAR} />
      <Path d="M-8 -6 H-1 V-1 H-11 Z M1 -6 H4 L7.5 -1 H1 Z" fill={SIGN_FILL} />
      <Circle cx={-10} cy={9} r={3.6} fill={CAR} stroke={SIGN_FILL} strokeWidth={1.6} />
      <Circle cx={8} cy={9} r={3.6} fill={CAR} stroke={SIGN_FILL} strokeWidth={1.6} />
    </G>
  );
}

export function CrashSign({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.9} viewBox="0 0 120 108" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M60 8 L113 100 H7 Z" fill={SIGN_FILL} stroke={SIGN_EDGE} strokeWidth={9} strokeLinejoin="round" />
      <Car x={38} y={76} angle={-12} />
      <Car x={82} y={76} angle={12} flip />
      <Path d="M60 52 V44 M51 55 L46 49 M69 55 L74 49" stroke={SIGN_EDGE} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
