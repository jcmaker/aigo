import { Suspense } from "react";
import { CheckoutLoader } from "@/components/commerce/CheckoutLoader";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";

export default function Page() {
  return (
    <>
      <Nav />
      <main className="frame min-h-[60vh] p-5 md:p-10">
        <h1 className="mb-6 text-3xl font-bold tracking-[-0.02em]">체크아웃</h1>
        <Suspense><CheckoutLoader /></Suspense>
      </main>
      <Footer />
    </>
  );
}
