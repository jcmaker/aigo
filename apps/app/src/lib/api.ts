import { useAuth } from '@clerk/expo';
import { useCallback, useRef } from 'react';

const FALLBACK_MESSAGE = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const NETWORK_MESSAGE = '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.';

/** API 오류. 분기는 message가 아니라 code로 한다. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

export async function toApiFailure(res: Response): Promise<ApiFailure> {
  const body = await res.json().catch(() => null);
  if (typeof body?.code === 'string' && typeof body?.message === 'string') {
    return new ApiFailure(res.status, body.code, body.message);
  }
  return new ApiFailure(res.status, 'UNKNOWN_ERROR', FALLBACK_MESSAGE);
}

type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

/** path는 api.gen.ts의 경로 그대로 쓴다(`/api/v1/...`). 401이면 토큰을 새로 받아 한 번 더 보낸다. */
export async function apiRequest<T>(getToken: GetToken, path: string, init: RequestInit = {}): Promise<T> {
  const send = async (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    try {
      return await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, { ...init, headers });
    } catch {
      throw new ApiFailure(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
    }
  };

  let res = await send(await getToken());
  if (res.status === 401) res = await send(await getToken({ skipCache: true }));
  if (!res.ok) throw await toApiFailure(res);
  if (res.status === 204) return undefined as T;
  // 프록시 오류 페이지 같은 2xx 비JSON 본문이 SyntaxError로 새지 않게 한다.
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiFailure(res.status, 'INVALID_RESPONSE', FALLBACK_MESSAGE);
  }
}

export function useApi() {
  const { getToken } = useAuth();
  // Clerk의 getToken은 렌더링마다 새 함수다. 의존성에 넣으면 useEffect가 API를 무한 호출한다.
  const latest = useRef(getToken);
  latest.current = getToken;
  return useCallback(
    <T,>(path: string, init?: RequestInit) => apiRequest<T>((o) => latest.current(o), path, init),
    [],
  );
}
