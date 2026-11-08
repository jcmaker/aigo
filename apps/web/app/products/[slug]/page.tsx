import { notFound } from "next/navigation";
import { ProductBuy } from "@/components/commerce/ProductBuy";
import { ProductError } from "@/components/commerce/ProductError";
import { ProductImage } from "@/components/commerce/ProductImage";
import type { Product } from "@/components/commerce/types";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { formatWon } from "@/lib/format";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/products/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res?.ok) {
    return (
      <>
        <Nav />
        <main className="frame">
          <ProductError />
        </main>
        <Footer />
      </>
    );
  }
  const p: Product = await res.json();

  return (
    <>
      <Nav />
      <main className="frame">
        <SectionLabel index="03" aside="상품">{p.name}</SectionLabel>
        <div className="grid gap-8 p-5 md:grid-cols-2 md:p-10">
          <ProductImage src={p.image_url} alt={`${p.name} 제품 사진`} sizes="(min-width: 768px) 50vw, 100vw" />
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold tracking-[-0.02em]">{p.name}</h1>
            <p className="text-muted">{p.description}</p>
            <p className="font-mono text-xl font-bold">{formatWon(p.price)}</p>
            <dl className="flex flex-col divide-y divide-line border border-line text-sm">
              {Object.entries(p.specs).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{String(v)}</dd>
                </div>
              ))}
            </dl>
            <ProductBuy slug={p.slug} price={p.price} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
