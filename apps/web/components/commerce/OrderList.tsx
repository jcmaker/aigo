import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { formatWon } from "@/lib/format";
import { TEST_PAYMENT_NOTICE, type Order } from "./types";

const STATUS = {
  pending: { label: "결제 대기", tone: "neutral" },
  paid: { label: "결제 완료", tone: "ok" },
  failed: { label: "결제 실패", tone: "danger" },
} as const;

const date = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

export function OrderList({ orders }: { orders: Order[] }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice label="테스트">{TEST_PAYMENT_NOTICE}</Notice>
      {orders.length === 0 ? (
        <p className="text-muted">주문 내역이 없습니다.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border border-line">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-col gap-1 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="hud text-muted">{date(o.created_at)}</span>
                <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
              </div>
              <p className="font-semibold">{o.order_name}</p>
              <p className="font-mono text-sm">{formatWon(o.amount)}</p>
              <p className="text-sm text-muted">{o.recipient_name} · {o.address}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
