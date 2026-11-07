"use client";

import Link from "next/link";
import { ProductImage } from "@/components/commerce/ProductImage";
import { useProducts } from "@/components/commerce/useProducts";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatWon } from "@/lib/format";

export function PosterProducts() {
  const { products, failed, retry } = useProducts();

  return (
    <section id="products" aria-labelledby="products-title" className="pl-products">
      <p className="pl-kicker">
        <span>DashPi</span>
        <span>토스 테스트 결제</span>
      </p>
      <div className="pl-products-grid">
        <div className="pl-product-photo">
          <ProductImage src={products?.[0]?.image_url} alt="DashPi 블랙박스 제품 사진" sizes="(min-width: 900px) 40vw, 90vw" />
        </div>
        <div>
          <h2 id="products-title" className="pl-display">
            찍고,
            <br />
            <em>바로 올린다.</em>
          </h2>
          {failed ? (
            <div className="pl-product-error">
              <Notice tone="danger">상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>
              <Button variant="secondary" onClick={retry}>
                다시 시도
              </Button>
            </div>
          ) : products === null ? (
            <Skeleton className="pl-product-skeleton" />
          ) : products.length === 0 ? (
            <p className="pl-lead">지금은 판매 중인 상품이 없습니다.</p>
          ) : (
            <ul className="pl-product-list">
              {products.map((product) => (
                <li key={product.slug}>
                  <Link href={`/products/${product.slug}`}>
                    <strong>{product.name}</strong>
                    <span>{formatWon(product.price)}</span>
                    <i aria-hidden>↗</i>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
