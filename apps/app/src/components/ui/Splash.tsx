import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { color } from '@/theme';

// 네이티브 스플래시는 #1C1C1C 바탕만 보인다(이미지 없음). 그래서 이 모션이 A의 등장부터 그대로 보여 준다.
const S = 273;
const WORD_W = 200;
const WORD_H = (WORD_W * 410) / 1374;
const TOTAL = 1400;

const layerA = require('../../../assets/brand/layer-a.png');
const layerRoad = require('../../../assets/brand/layer-road.png');
const layerStar = require('../../../assets/brand/layer-star.png');
const wordText = require('../../../assets/brand/wordtext-light.png');

const run = (v: Animated.Value, to: number, duration: number, delay: number, easing: (t: number) => number, native = true) =>
  Animated.timing(v, { toValue: to, duration, delay, easing, useNativeDriver: native });

// 진입 모션 "길 그리기": A(0~0.45s) → 길(0.3~1.0s) → 별(1.0~1.4s), 글자 1.05s부터.
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
      <Animated.Image source={wordText} style={[s.word, rise(word)]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  // 로고는 화면 한가운데(네이티브 스플래시와 같은 자리), 글자는 그 아래에 둔다.
  layer: { position: 'absolute', left: '50%', top: '50%', width: S, height: S, marginLeft: -S / 2, marginTop: -S / 2 },
  word: { position: 'absolute', left: '50%', top: '50%', width: WORD_W, height: WORD_H, marginLeft: -WORD_W / 2, marginTop: S / 2 },
});
