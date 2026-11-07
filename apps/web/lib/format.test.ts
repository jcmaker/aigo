import { expect, test } from "vitest";
import { formatTime, formatWon } from "./format";

test("formatWon은 세 자리마다 쉼표를 찍고 원을 붙인다", () => {
  expect(formatWon(129000)).toBe("129,000원");
  expect(formatWon(0)).toBe("0원");
});

test("formatTime은 초를 분:초로 바꾼다", () => {
  expect(formatTime(0)).toBe("0:00");
  expect(formatTime(7.9)).toBe("0:07");
  expect(formatTime(125)).toBe("2:05");
});
