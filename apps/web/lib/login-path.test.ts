import { expect, test } from "vitest";
import { safeRedirect } from "@/components/auth/redirect";
import { loginPath } from "./login-path";

test("로그인 뒤 돌아올 주소는 쿼리까지 보존되는 내부 경로다", () => {
  const url = new URL(loginPath("/checkout", "?product=dashpi-standard&quantity=2"), "https://aigo.example");
  expect(url.pathname).toBe("/login");
  expect(safeRedirect(url.searchParams.get("redirect_url"))).toBe("/checkout?product=dashpi-standard&quantity=2");
});
