"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnalysisList } from "@/components/analysis/AnalysisList";
import type { Analysis } from "@/components/analysis/types";
import { buttonClass } from "@/components/ui/Button";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";
import { Notice } from "@/components/ui/Notice";
import { useApi } from "@/lib/api";

export default function AnalysesPage() {
  const { request } = useApi();
  const [items, setItems] = useState<Analysis[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // 최근 100건까지만 보여 준다.
    request<{ items: Analysis[] }>("/api/v1/analyses?limit=100").then((r) => setItems(r.items), (e) => setError(e.message));
  }, [request]);

  return (
    <>
      <Nav />
      <main className="frame min-h-[60vh]">
        <header className="flex items-center justify-between gap-4 border-b border-line p-5 md:p-10">
          <h1 className="text-3xl font-bold tracking-[-0.02em]">내 분석</h1>
          <Link href="/analyses/new" className={buttonClass()}>
            영상 올리기
          </Link>
        </header>
        {error ? (
          <div className="p-5 md:p-10">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : items ? (
          <AnalysisList items={items} />
        ) : (
          <p role="status" className="p-5 text-muted md:p-10">불러오는 중...</p>
        )}
      </main>
      <Footer />
    </>
  );
}
