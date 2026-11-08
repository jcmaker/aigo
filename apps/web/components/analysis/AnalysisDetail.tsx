"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, useApi } from "@/lib/api";
import { FailureNotice } from "./FailureNotice";
import { ProgressView } from "./ProgressView";
import { ReportView } from "./ReportView";
import type { Analysis } from "./types";

const POLL_MS = 3000;
const SETTLED = new Set(["done", "failed", "created"]); // created는 업로드를 끝내지 않은 분석이라 저절로 바뀌지 않는다.

type ViewProps = {
  analysis: Analysis;
  stale?: boolean;
  deleting?: boolean;
  deleteError?: string;
  onDelete: () => void;
  onReload?: () => void;
};

function Body({ analysis, stale, onReload }: Pick<ViewProps, "analysis" | "stale" | "onReload">) {
  if (analysis.status !== "done") return <ProgressView analysis={analysis} stale={stale} />;
  if (analysis.report) return <ReportView analysis={analysis} onReload={onReload} />;
  return (
    <div className="p-5 md:p-10">
      <FailureNotice code="REPORT_MISSING" message="분석은 끝났지만 레포트가 없습니다. 영상을 다시 올려 주세요." />
    </div>
  );
}

export function AnalysisView({ analysis, stale, deleting, deleteError, onDelete, onReload }: ViewProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 py-4 md:px-10 print:hidden">
        <Link href="/analyses" className="hud text-muted transition-colors duration-[var(--dur-hover)] hover:text-ink">
          ← 내 분석 / #{analysis.id}
        </Link>
        <Button size="sm" variant="danger" loading={deleting} onClick={onDelete}>
          분석 삭제
        </Button>
      </div>
      {deleteError && (
        <div className="px-5 pb-4 md:px-10 print:hidden">
          <Notice tone="danger">{deleteError}</Notice>
        </div>
      )}
      <Body analysis={analysis} stale={stale} onReload={onReload} />
    </>
  );
}

export function AnalysisDetail({ id }: { id: string }) {
  const { request } = useApi();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [reloads, setReloads] = useState(0);
  const stopPolling = useRef(() => {});

  useEffect(() => {
    let stopped = false;
    let fetching = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      clearTimeout(timer);
      if (document.hidden || fetching) return;
      fetching = true;
      try {
        const next = await request<Analysis>(`/api/v1/analyses/${id}`);
        if (stopped) return;
        setAnalysis(next);
        setStale(false);
        stopped = SETTLED.has(next.status);
      } catch (e) {
        if (stopped) return;
        // 404만 끝이다. 401(토큰 갱신), 429, 5xx, 네트워크 오류는 잠깐일 수 있어 계속 묻는다.
        if (e instanceof ApiError && e.status === 404) {
          setError(e.message);
          stopped = true;
        } else {
          setStale(true);
        }
      } finally {
        fetching = false;
      }
      if (!stopped && !document.hidden) timer = setTimeout(poll, POLL_MS);
    };

    const onVisibility = () => {
      if (!stopped) poll();
    };
    stopPolling.current = () => {
      stopped = true;
      clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVisibility);
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [id, request, reloads]);

  async function remove() {
    if (!window.confirm("이 분석과 영상 파일을 지웁니다. 되돌릴 수 없습니다.")) return;
    stopPolling.current(); // 삭제 뒤 도착한 폴링의 404가 오류 화면을 띄우지 않게 한다.
    setDeleting(true);
    setDeleteError("");
    try {
      await request(`/api/v1/analyses/${id}`, { method: "DELETE" });
      router.push("/analyses");
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "삭제하지 못했습니다. 다시 시도해 주세요.");
      setDeleting(false);
      if (analysis && !SETTLED.has(analysis.status)) setReloads((n) => n + 1); // 아직 진행 중이면 다시 묻는다.
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4 p-5 md:p-10">
        <Notice tone="danger">{error}</Notice>
        <Link href="/analyses" className={buttonClass({ variant: "secondary" })}>
          내 분석으로
        </Link>
      </div>
    );
  }
  if (!analysis) {
    return (
      <div role="status" aria-label="불러오는 중" className="flex flex-col gap-4 p-5 md:p-10">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return (
    <AnalysisView
      analysis={analysis}
      stale={stale}
      deleting={deleting}
      deleteError={deleteError}
      onDelete={remove}
      onReload={() => setReloads((n) => n + 1)}
    />
  );
}
