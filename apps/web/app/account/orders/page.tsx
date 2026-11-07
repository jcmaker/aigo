"use client";

import { useEffect, useState } from "react";
import { OrderList } from "@/components/commerce/OrderList";
import type { Order } from "@/components/commerce/types";
import { Notice } from "@/components/ui/Notice";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";
import { useApi } from "@/lib/api";

export default function OrdersPage() {
  const { request } = useApi();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // 최근 100건까지만 보여 준다.
    request<{ items: Order[] }>("/api/v1/orders?limit=100").then((r) => setOrders(r.items), (e) => setError(e.message));
  }, [request]);

  return (
    <>
      <Nav />
      <main className="frame min-h-[60vh] p-5 md:p-10">
        <h1 className="mb-6 text-3xl font-bold tracking-[-0.02em]">내 주문</h1>
        {error ? <Notice tone="danger">{error}</Notice> : orders ? <OrderList orders={orders} /> : <p role="status" className="text-muted">불러오는 중...</p>}
      </main>
      <Footer />
    </>
  );
}
