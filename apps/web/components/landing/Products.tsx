"use client";

import { ProductImage } from "@/components/commerce/ProductImage";
import type { Product } from "@/components/commerce/types";
import { useProducts } from "@/components/commerce/useProducts";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatWon } from "@/lib/format";

function ProductCard({ product, index }: { product: Product; index: number }) {
  return (
    <Card
      index={`0${index + 1}`}
      badge={<Badge tone="accent">판매 중</Badge>}
      title={product.name}
      href={`/products/${product.slug}`}
    >
      <p>{product.description}</p>
      <div className="mt-4">
        <ProductImage src={product.image_url} alt={`${product.name} 제품 사진`} sizes="(min-width: 1024px) 30vw, 100vw" />
      </div>
      <dl className="mt-4 border-t border-line">
        {Object.entries(product.specs).map(([term, value]) => (
          <div key={term} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 border-b border-line py-2">
            <dt className="hud pt-0.5">{term}</dt>
            <dd className="text-ink">{String(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 font-mono text-2xl font-semibold tracking-tight text-ink-strong">{formatWon(product.price)}</p>
    </Card>
  );
}

export function Products() {
  const { products, failed, retry } = useProducts();

  return (
    <section id="products" aria-labelledby="products-title">
      <SectionLabel index="03" aside="토스 테스트 결제">
        상품
      </SectionLabel>
      <Reveal className="cells lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-5 px-5 py-12 md:px-10 md:py-16">
          <h2
            id="products-title"
            className="text-3xl leading-tight font-extrabold tracking-[-0.03em] text-ink-strong md:text-5xl"
          >
            분석까지 이어지는 블랙박스
          </h2>
          <p className="max-w-sm text-muted">
            DashPi 블랙박스로 찍은 영상을 AIGO에 그대로 올려 레포트를 받습니다. 상품 상세에서 바로 구매하며, 테스트 결제라서 실제로 청구되지
            않습니다.
          </p>
        </div>

        {failed ? (
          <div className="flex flex-col gap-4 p-5 md:p-8">
            <div className="max-w-sm">
              <ProductImage alt="DashPi 블랙박스 제품 사진" sizes="384px" />
            </div>
            <Notice tone="danger">상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>
            <Button variant="secondary" size="sm" onClick={retry}>
              다시 시도
            </Button>
          </div>
        ) : products === null ? (
          <div className="grid gap-5 p-5 sm:grid-cols-2 md:p-8">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        ) : products.length === 0 ? (
          <p className="p-5 text-muted md:p-8">지금은 판매 중인 상품이 없습니다.</p>
        ) : (
          <div className="cells grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))]">
            {products.map((product, i) => (
              <ProductCard key={product.slug} product={product} index={i} />
            ))}
          </div>
        )}
      </Reveal>
    </section>
  );
}
