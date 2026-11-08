"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "./types";

/** 공개 API라 토큰이 필요 없다. useApi를 쓰면 Clerk가 뜰 때까지 상품이 기다리게 된다. */
export function useProducts() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/products`, { signal });
      if (!res.ok) throw new Error(String(res.status));
      const { items } = await res.json();
      if (!Array.isArray(items)) throw new Error("items 없음");
      setProducts(items);
    } catch {
      if (!signal?.aborted) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { products, failed, retry: () => load() };
}
