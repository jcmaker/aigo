"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 900;

/** 서버 HTML과 reduced-motion에서는 최종값 그대로다. 화면에 들어올 때 한 번만 센다. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<string | null>(null);
  const final = value.toFixed(decimals);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION);
          setShown((value * (1 - (1 - t) ** 3)).toFixed(decimals));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(ref.current!);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      setShown(null);
    };
  }, [value, decimals]);

  return (
    <span ref={ref} className="tabular-nums">
      {shown ?? final}
    </span>
  );
}
