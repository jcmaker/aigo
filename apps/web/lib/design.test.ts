import { expect, test } from "vitest";
import { DESIGN_COOKIE, DESIGN_MAX_AGE, parseDesign } from "./design";

test("쿠키 이름과 기간은 aigo-design, 1년이다", () => {
  expect(DESIGN_COOKIE).toBe("aigo-design");
  expect(DESIGN_MAX_AGE).toBe(31_536_000);
});

test("정해진 두 값만 받는다", () => {
  expect(parseDesign("classic")).toBe("classic");
  expect(parseDesign("poster")).toBe("poster");
  for (const bad of ["Poster", "neon", "", " poster", null, undefined]) expect(parseDesign(bad)).toBeNull();
});
