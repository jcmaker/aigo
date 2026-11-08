import { formatWon } from "@/lib/format";
import { Notice } from "@/components/ui/Notice";
import { TEST_PAYMENT_NOTICE } from "./types";

type Props = { name: string; unitPrice: number; quantity: number; amount: number };

/** amount는 주문을 만든 뒤에는 서버 응답 금액이다. 그 전에는 화면 추정치다. */
export function OrderSummary({ name, unitPrice, quantity, amount }: Props) {
  return (
    <section aria-label="주문 요약" className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2 border border-line p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">상품</dt>
          <dd className="font-semibold">{name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">단가 x 수량</dt>
          <dd className="font-mono">
            {formatWon(unitPrice)} x {quantity}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-3 text-base">
          <dt className="font-bold">결제 금액</dt>
          <dd className="font-mono font-bold">{formatWon(amount)}</dd>
        </div>
      </dl>
      <Notice label="테스트">{TEST_PAYMENT_NOTICE}</Notice>
    </section>
  );
}
