"use client";

import { useState } from "react";
import { clerkMessage } from "./clerkErrors";

type Result = { error: unknown } | void;

/** 제출 중 표시와 한국어 오류 문구를 한 곳에서 다룬다. 성공하면 true. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<Result>) {
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result?.error) {
        setError(clerkMessage(result.error));
        return false;
      }
      return true;
    } catch (e) {
      setError(clerkMessage(e));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, run, clear: () => setError(null), fail: setError };
}
