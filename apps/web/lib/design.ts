export const DESIGN_COOKIE = "aigo-design";
export const DESIGN_MAX_AGE = 60 * 60 * 24 * 365;

export type Design = "classic" | "poster";

/** 쿠키와 주소 파라미터는 사용자가 고칠 수 있으므로 정해진 값만 받는다. */
export function parseDesign(value: string | null | undefined): Design | null {
  return value === "classic" || value === "poster" ? value : null;
}
