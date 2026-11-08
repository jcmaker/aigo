import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError, useApi } from "./api";

const getToken = vi.fn();
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken }) }));

const fetchMock = vi.fn();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const api = () => renderHook(() => useApi()).result.current;
const authOf = (call: number) => new Headers(fetchMock.mock.calls[call][1].headers).get("Authorization");

beforeEach(() => {
  getToken.mockReset().mockResolvedValue("tok-1");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

test("Bearer 토큰을 붙인다", async () => {
  fetchMock.mockResolvedValue(json(200, { ok: true }));

  await expect(api().request("/api/v1/me")).resolves.toEqual({ ok: true });

  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/me");
  expect(authOf(0)).toBe("Bearer tok-1");
});

test("로그아웃 상태면 Authorization을 붙이지 않는다", async () => {
  getToken.mockResolvedValue(null);
  fetchMock.mockResolvedValue(json(200, []));

  await api().request("/api/v1/products");

  expect(authOf(0)).toBeNull();
});

test("401이면 새 토큰으로 한 번만 재시도한다", async () => {
  getToken.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
  fetchMock.mockResolvedValueOnce(json(401, { code: "UNAUTHORIZED", message: "만료" }));
  fetchMock.mockResolvedValueOnce(json(200, { ok: true }));

  await expect(api().request("/api/v1/me")).resolves.toEqual({ ok: true });

  expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });
  expect(authOf(1)).toBe("Bearer new");
});

test("재시도도 401이면 더 시도하지 않고 ApiError를 던진다", async () => {
  fetchMock.mockImplementation(async () => json(401, { code: "UNAUTHORIZED", message: "로그인이 필요합니다." }));

  await expect(api().request("/api/v1/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });

  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("오류 응답을 ApiError로 바꾼다", async () => {
  fetchMock.mockResolvedValue(json(409, { code: "DAILY_LIMIT", message: "오늘 한도를 다 썼습니다." }));

  const error = await api().request("/api/v1/analyses").catch((e) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 409, code: "DAILY_LIMIT", message: "오늘 한도를 다 썼습니다." });
});

test("JSON이 아닌 오류도 일반 문구로 바꾼다", async () => {
  fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

  await expect(api().request("/api/v1/me")).rejects.toMatchObject({
    status: 502,
    code: "UNKNOWN_ERROR",
    message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  });
});

test("네트워크 실패도 한국어 ApiError로 바꾼다", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

  await expect(api().request("/api/v1/me")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
});

test("요청 취소는 ApiError로 바꾸지 않는다", async () => {
  fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));

  await expect(api().request("/api/v1/me")).rejects.toMatchObject({ name: "AbortError" });
});

test("204는 본문 없이 끝난다", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

  await expect(api().request("/api/v1/me", { method: "DELETE" })).resolves.toBeUndefined();
});

test("문자열 본문은 JSON으로 보낸다", async () => {
  fetchMock.mockResolvedValue(json(201, {}));

  await api().request("/api/v1/orders", { method: "POST", body: "{}" });

  expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Content-Type")).toBe("application/json");
});

test("리렌더해도 request는 같은 함수다", () => {
  const { result, rerender } = renderHook(() => useApi());
  const first = result.current.request;

  rerender();

  expect(result.current.request).toBe(first);
});
