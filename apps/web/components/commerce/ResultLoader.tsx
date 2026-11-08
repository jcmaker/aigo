"use client";

import { useSearchParams } from "next/navigation";
import { Notice } from "@/components/ui/Notice";
import { FailView, SuccessView } from "./PaymentResult";

export function SuccessLoader() {
  const sp = useSearchParams();
  const orderId = Number(sp.get("order"));
  const paymentKey = sp.get("paymentKey");
  const tossOrderId = sp.get("orderId");
  const amount = Number(sp.get("amount"));
  if (!Number.isInteger(orderId) || orderId < 1 || !paymentKey || !tossOrderId || !Number.isFinite(amount)) {
    return <Notice tone="danger">결제 결과 정보가 올바르지 않습니다.</Notice>;
  }
  return <SuccessView orderId={orderId} paymentKey={paymentKey} tossOrderId={tossOrderId} amount={amount} />;
}

export function FailLoader() {
  const sp = useSearchParams();
  return <FailView orderId={sp.get("order") ?? undefined} code={sp.get("code") ?? undefined} message={sp.get("message") ?? undefined} />;
}
