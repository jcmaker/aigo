"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useApi } from "@/lib/api";
import { OrderSummary } from "./OrderSummary";
import { TossWidget } from "./TossWidget";
import type { Order, Product } from "./types";

type Props = { product: Product; quantity: number };

export function CheckoutForm({ product, quantity }: Props) {
  const { request } = useApi();
  const [f, setF] = useState({ recipient_name: "", phone: "", address: "", address_detail: "" });
  const [state, setState] = useState<{ order: Order; customerKey: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ready = [f.recipient_name, f.phone, f.address].every((v) => v.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const me = await request<{ id: number }>("/api/v1/me");
      const order = await request<Order>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({ product_slug: product.slug, quantity, ...f }),
      });
      // 토스 customerKey는 2자 이상이어야 해서 접두사를 붙인다. 값은 User.id다.
      setState({ order, customerKey: `user-${me.id}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "주문을 만들지 못했습니다.");
    }
    setBusy(false);
  }

  const order = state?.order;
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        {order && state ? (
          <TossWidget
            customerKey={state.customerKey}
            amount={order.amount}
            tossOrderId={order.toss_order_id}
            orderName={order.order_name}
            successUrl={`${window.location.origin}/checkout/success?order=${order.id}`}
            failUrl={`${window.location.origin}/checkout/fail?order=${order.id}`}
          />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="받는 사람" autoComplete="name" required maxLength={100} value={f.recipient_name} onChange={set("recipient_name")} />
            <Field label="연락처" type="tel" autoComplete="tel" required maxLength={30} value={f.phone} onChange={set("phone")} />
            <Field label="주소" autoComplete="street-address" required maxLength={190} value={f.address} onChange={set("address")} />
            <Field label="상세 주소" maxLength={100} value={f.address_detail} onChange={set("address_detail")} />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" size="lg" disabled={!ready} loading={busy}>
              주문하고 결제 진행
            </Button>
          </form>
        )}
      </div>
      <OrderSummary
        name={product.name}
        unitPrice={product.price}
        quantity={quantity}
        amount={order ? order.amount : product.price * quantity}
      />
    </div>
  );
}
