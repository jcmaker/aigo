"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useApi } from "@/lib/api";
import { CheckoutForm } from "./CheckoutForm";
import type { Product } from "./types";

/** /checkout?product=&quantity= 를 검증하고 상품을 불러온다. */
export function CheckoutLoader() {
  const sp = useSearchParams();
  const { request } = useApi();
  const slug = sp.get("product");
  const quantity = Number(sp.get("quantity") ?? "1");
  const valid = !!slug && Number.isInteger(quantity) && quantity >= 1 && quantity <= 5;
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!valid) return;
    request<Product>(`/api/v1/products/${encodeURIComponent(slug)}`).then(setProduct, (e) => setError(e.message));
  }, [valid, slug, request]);

  if (!valid || error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Notice tone="danger">{error || "상품이나 수량(1~5개)이 올바르지 않습니다."}</Notice>
        <Link href="/#products" className={buttonClass({ variant: "secondary" })}>상품으로 돌아가기</Link>
      </div>
    );
  }
  if (!product) return <p role="status" className="text-muted">불러오는 중...</p>;
  return <CheckoutForm product={product} quantity={quantity} />;
}
