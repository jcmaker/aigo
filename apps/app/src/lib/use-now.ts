import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** active인 동안 1초마다 지금 시각을 준다. 앱이 백그라운드면 멈춘다. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    if (AppState.currentState !== 'background') start();
    return () => {
      stop();
      sub.remove();
    };
  }, [active]);
  return now;
}
