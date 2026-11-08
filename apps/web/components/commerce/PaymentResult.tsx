"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ApiError, useApi } from "@/lib/api";
import { formatWon } from "@/lib/format";
import type { Order } from "./types";

type SuccessProps = { orderId: number; paymentKey: string; tossOrderId: string; amount: number };
type State =
  | { kind: "loading" }
  | { kind: "paid"; order: Order }
  | { kind: "error"; message: string; retry: boolean };

export function SuccessView({ orderId, paymentKey, tossOrderId, amount }: SuccessProps) {
  const { request } = useApi();
  const [state, setState] = useState<State>({ kind: "loading" });
  const started = useRef(false); // Strict Mode 이중 실행에서 승인을 두 번 부르지 않는다.

  const run = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      // 금액은 URL이 아니라 서버 주문에서 가져온다. URL 값은 대조만 한다.
      const order = await request<Order>(`/api/v1/orders/${orderId}`);
      if (order.toss_order_id !== tossOrderId || order.amount !== amount) {
        setState({ kind: "error", message: "결제 정보가 주문과 일치하지 않아 승인하지 않았습니다.", retry: false });
        return;
      }
      if (order.status === "paid") return setState({ kind: "paid", order }); // 새로고침
      const paid = await request<Order>(`/api/v1/orders/${orderId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ payment_key: paymentKey, amount: order.amount }),
      });
      setState({ kind: "paid", order: paid });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setState({
        kind: "error",
        message: err?.message ?? "결제를 확인하지 못했습니다.",
        retry: err?.code === "PAYMENT_RETRY" || err?.code === "NETWORK_ERROR",
      });
    }
  }, [request, orderId, paymentKey, tossOrderId, amount]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  if (state.kind === "loading") return <p role="status" className="text-muted">결제를 확인하고 있습니다...</p>;
  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-4">
        <Notice tone="danger">{state.message}</Notice>
        {state.retry ? (
          <Button onClick={run}>다시 시도</Button>
        ) : (
          <Link href="/account/orders" className={buttonClass({ variant: "secondary" })}>내 주문 보기</Link>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-4">
      <h2 className="text-2xl font-bold">결제가 완료되었습니다</h2>
      <p className="text-muted">
        {state.order.order_name} · <span className="font-mono">{formatWon(state.order.amount)}</span>
      </p>
      <Link href="/account/orders" className={buttonClass()}>내 주문 보기</Link>
    </div>
  );
}

export function FailView({ orderId, code, message }: { orderId?: string; code?: string; message?: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h2 className="text-2xl font-bold">결제하지 못했습니다</h2>
      <Notice tone="danger">{message || "결제가 취소되었거나 실패했습니다."}</Notice>
      {code && <p className="hud text-muted">오류 코드 {code}{orderId ? ` · 주문 ${orderId}` : ""}</p>}
      <Link href="/#products" className={buttonClass()}>상품으로 돌아가기</Link>
    </div>
  );
}
