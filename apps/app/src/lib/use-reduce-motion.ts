import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** 시스템 "동작 줄이기" 설정. 켜져 있으면 회전·빛 효과를 끈다. */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}
