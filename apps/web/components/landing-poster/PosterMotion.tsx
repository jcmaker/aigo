"use client";

import { useEffect } from "react";

// 화면 높이에 대한 이동 비율. 둘 다 위로 움직여 제목이 아래 안내 글로 내려가지 않는다.
const TITLE = 0.06;
const PHONE = 0.12;
const WORD = 0.08;
const NARROW = 0.5; // 768px 미만에서는 절반만 움직인다

const ENTER = 0.9; // 위쪽 끝이 화면 높이의 이 지점을 넘으면 나타난다
const LEAVE = 0.14; // 아래쪽 끝이 이 지점보다 위로 가면 사라진다

const shift = (el: HTMLElement, y: number) => {
  el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
};

/** 숨김은 이 효과가 data-fade를 쓴 뒤에만 생긴다. JS가 없거나 움직임을 줄이면 모두 그대로 보인다. */
export function PosterMotion() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const narrow = matchMedia("(max-width: 767px)");
    const hero = document.getElementById("hero")!;
    const title = hero.querySelector<HTMLElement>(".pl-title")!;
    const phone = hero.querySelector<HTMLElement>(".pl-phone-wrap")!;
    const words = [...document.querySelectorAll<HTMLElement>(".pl-word")];
    const items = [
      ...document.querySelectorAll<HTMLElement>("#story :is(.pl-label, .pl-chapter-title, .pl-lead, .pl-card)"),
    ];
    let frame = 0;

    const update = () => {
      frame = 0;
      const vh = innerHeight;
      const scale = narrow.matches ? NARROW : 1;

      const heroBox = hero.getBoundingClientRect();
      const passed = Math.min(1, Math.max(0, -heroBox.top / heroBox.height));
      shift(title, -TITLE * vh * scale * passed);
      shift(phone, -PHONE * vh * scale * passed);

      for (const word of words) {
        const box = word.parentElement!.getBoundingClientRect();
        const offset = (box.top + box.height / 2 - vh / 2) / vh;
        shift(word, -Math.min(1, Math.max(-1, offset)) * WORD * vh * scale);
      }

      for (const item of items) {
        const box = item.getBoundingClientRect();
        item.dataset.fade = box.top > vh * ENTER ? "below" : box.bottom < vh * LEAVE ? "above" : "in";
      }
    };

    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };

    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
