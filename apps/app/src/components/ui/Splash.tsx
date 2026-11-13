import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { color } from '@/theme';

// 네이티브 스플래시는 #1C1C1C 바탕만 보인다(이미지 없음). 그래서 이 모션이 A의 등장부터 그대로 보여 준다.
const S = 273;
const WORD_W = 200;
const WORD_H = (WORD_W * 410) / 1374;
// 로고 PNG(1134px)는 위아래에 투명 여백이 있다. 눈에 보이는 모양은 x 157~955, y 222~920px(ADR 0026).
// 여백만큼 음수 margin을 주어 보이는 모양 기준으로 배치하고, 모양이 왼쪽으로 치우친 만큼 오른쪽으로 민다.
const PNG = 1134;
const MARK_TOP_PAD = (S * 222) / PNG; // 약 53.4
const MARK_BOTTOM_PAD = (S * (PNG - 920)) / PNG; // 약 51.5
const MARK_SHIFT_X = (S * (PNG / 2 - (157 + 955) / 2)) / PNG; // 약 2.6
const WORD_GAP = 28; // 보이는 심벌 아래와 글자 사이
const MOTION = 1400;
// 모션이 끝난 뒤 완성된 로고를 0.8초 더 보여 준다(ADR 0026).
const HOLD = 800;
const TOTAL = MOTION + HOLD;

const layerA = require('../../../assets/brand/layer-a.png');
const layerRoad = require('../../../assets/brand/layer-road.png');
const layerStar = require('../../../assets/brand/layer-star.png');
const wordText = require('../../../assets/brand/wordtext-light.png');

const run = (v: Animated.Value, to: number, duration: number, delay: number, easing: (t: number) => number, native = true) =>
  Animated.timing(v, { toValue: to, duration, delay, easing, useNativeDriver: native });

// 진입 모션 "길 그리기": A(0~0.45s) → 길(0.3~1.0s) → 별(1.0~1.4s), 글자 1.05s부터. 그 뒤 0.8초 멈춰 보여 주고 2.2s에 onDone.
// still이면 모션 없이 마지막 장면만 그린다(이미 한 번 재생한 뒤 index가 다시 마운트될 때).
export function Splash({ onDone, still = false }: { onDone?: () => void; still?: boolean }) {
  const from = still ? 1 : 0;
  const a = useRef(new Animated.Value(from)).current;
  const road = useRef(new Animated.Value(from)).current;
  const star = useRef(new Animated.Value(from)).current;
  const word = useRef(new Animated.Value(from)).current;

  // 부모가 매번 새 함수를 넘겨도 모션이 다시 시작되지 않도록 최신 콜백만 ref로 들고 있다.
  const cb = useRef(onDone);
  cb.current = onDone;

  useEffect(() => {
    if (still) return;
    // 완료 시점은 애니메이션 콜백이 아니라 타이머로 정한다(결정적이고 테스트하기 쉽다).
    const t = setTimeout(() => cb.current?.(), TOTAL);
    const anim = Animated.parallel([
      run(a, 1, 450, 0, Easing.out(Easing.quad)),
      run(road, 1, 700, 300, Easing.bezier(0.6, 0, 0.2, 1), false), // 너비는 네이티브 드라이버를 못 쓴다
      run(star, 1, 400, 1000, Easing.bezier(0.3, 1.6, 0.5, 1)),
      run(word, 1, 350, 1050, Easing.out(Easing.quad)),
    ]);
    anim.start();
    return () => { clearTimeout(t); anim.stop(); };
  }, [a, road, star, word, still]);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });

  return (
    <View style={s.root} accessible accessibilityLabel="AIGO">
      <View style={s.mark}>
        <Animated.Image source={layerA} style={[s.layer, rise(a)]} />
        <Animated.View style={[s.layer, { width: road.interpolate({ inputRange: [0, 1], outputRange: [0, S] }), overflow: 'hidden' }]}>
          <Image source={layerRoad} style={{ width: S, height: S }} />
        </Animated.View>
        <Animated.Image
          source={layerStar}
          style={[s.layer, {
            opacity: star.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
            transform: [
              { scale: star },
              { rotate: star.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) },
            ],
          }]}
        />
      </View>
      <Animated.Image source={wordText} resizeMode="contain" style={[s.word, rise(word)]} />
    </View>
  );
}

// 심벌과 글자를 한 묶음(로고 그룹)으로 그린다. 화면 안의 세로 위치는 index가 정한다.
const s = StyleSheet.create({
  root: { alignItems: 'center' },
  mark: { width: S, height: S, marginTop: -MARK_TOP_PAD, marginBottom: -MARK_BOTTOM_PAD, transform: [{ translateX: MARK_SHIFT_X }] },
  layer: { position: 'absolute', left: 0, top: 0, width: S, height: S },
  word: { width: WORD_W, height: WORD_H, marginTop: WORD_GAP },
});
