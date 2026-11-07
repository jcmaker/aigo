"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo } from "react";

const FALLBACK_MESSAGE = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const NETWORK_MESSAGE = "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  if (typeof body?.code === "string" && typeof body?.message === "string") {
    return new ApiError(res.status, body.code, body.message);
  }
  return new ApiError(res.status, "UNKNOWN_ERROR", FALLBACK_MESSAGE);
}

/** path는 api.gen.ts의 경로 그대로 쓴다(`/api/v1/...`). */
export function useApi() {
  const { getToken } = useAuth();

  const request = useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const send = async (token: string | null) => {
        const headers = new Headers(init.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        if (typeof init.body === "string" && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
        try {
          return await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { ...init, headers });
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") throw e;
          throw new ApiError(0, "NETWORK_ERROR", NETWORK_MESSAGE);
        }
      };

      let res = await send(await getToken());
      if (res.status === 401) res = await send(await getToken({ skipCache: true }));
      if (!res.ok) throw await toApiError(res);
      return (res.status === 204 ? undefined : await res.json()) as T;
    },
    [getToken],
  );

  return useMemo(() => ({ request }), [request]);
}
