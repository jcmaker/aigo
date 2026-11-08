"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Phase = "wait" | "in" | undefined;

/** 화면 밖에서 시작한 내용만 숨겼다가 올린다. JS가 없거나 움직임을 줄인 환경에서는 그냥 보인다. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>();

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let waited = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (waited) setPhase("in");
        observer.disconnect();
      } else {
        waited = true;
        setPhase("wait");
      }
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={phase} className={className}>
      {children}
    </div>
  );
}
