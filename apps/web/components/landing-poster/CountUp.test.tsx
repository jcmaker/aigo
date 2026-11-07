import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CountUp } from "./CountUp";

let intersect: (entries: { isIntersecting: boolean }[]) => void;
let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("세는 중에 값이 바뀌어도 React가 새 값을 그린다", () => {
  const { container, rerender } = render(<CountUp value={20} />);
  const node = container.querySelector("span")!.firstChild;

  act(() => {
    intersect([{ isIntersecting: true }]);
    frames.shift()!(performance.now() + 100);
  });
  expect(container.textContent).not.toBe("20");
  expect(container.querySelector("span")!.firstChild).toBe(node);

  rerender(<CountUp value={30} />);
  expect(container.textContent).toBe("30");
});

test("끝까지 세면 최종값이다", () => {
  const { container } = render(<CountUp value={7.4} decimals={1} />);

  act(() => {
    intersect([{ isIntersecting: true }]);
    frames.shift()!(performance.now() + 5000);
  });
  expect(container.textContent).toBe("7.4");
});
