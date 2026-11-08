"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { formatWon } from "@/lib/format";
import { QuantityPicker } from "./QuantityPicker";

export function ProductBuy({ slug, price }: { slug: string; price: number }) {
  const [quantity, setQuantity] = useState(1);
  return (
    <div className="flex flex-col gap-4">
      <QuantityPicker value={quantity} onChange={setQuantity} />
      <p className="font-mono text-lg font-bold">{formatWon(price * quantity)}</p>
      <Link href={`/checkout?product=${encodeURIComponent(slug)}&quantity=${quantity}`} className={buttonClass({ size: "lg" })}>
        구매하기
      </Link>
    </div>
  );
}
