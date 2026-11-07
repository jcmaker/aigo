"use client";

import { loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

type Props = {
  customerKey: string;
  amount: number;
  tossOrderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
};

/** 토스 결제위젯 v2. 이 영역만 토스 UI다. */
export function TossWidget({ customerKey, amount, tossOrderId, orderName, successUrl, failUrl }: Props) {
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!clientKey) return;
    let stale = false; // Strict Mode 첫 실행이 끝나기 전에 정리되면 그릴 필요가 없다.
    (async () => {
      try {
        const w = (await loadTossPayments(clientKey)).widgets({ customerKey });
        await w.setAmount({ currency: "KRW", value: amount });
        if (stale) return;
        await Promise.all([
          w.renderPaymentMethods({ selector: "#toss-methods" }),
          w.renderAgreement({ selector: "#toss-agreement" }),
        ]);
        if (!stale) setWidgets(w);
      } catch (e) {
        if (!stale) setError(e instanceof Error ? e.message : "결제 위젯을 불러오지 못했습니다.");
      }
    })();
    return () => {
      stale = true;
    };
  }, [clientKey, customerKey, amount]);

  if (!clientKey) {
    return <Notice tone="danger">결제 클라이언트 키(NEXT_PUBLIC_TOSS_CLIENT_KEY)가 설정되지 않아 결제를 진행할 수 없습니다.</Notice>;
  }

  async function pay() {
    if (!widgets) return;
    setPaying(true);
    setError("");
    try {
      await widgets.requestPayment({ orderId: tossOrderId, orderName, successUrl, failUrl });
    } catch (e) {
      // 결제창을 닫으면 여기로 온다. 성공하면 successUrl로 이동하므로 오지 않는다.
      setError(e instanceof Error ? e.message : "결제를 시작하지 못했습니다.");
    }
    setPaying(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div id="toss-methods" />
      <div id="toss-agreement" />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" full disabled={!widgets} loading={paying} onClick={pay}>
        결제하기
      </Button>
    </div>
  );
}
