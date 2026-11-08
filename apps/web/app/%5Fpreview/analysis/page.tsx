"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { AnalysisView } from "@/components/analysis/AnalysisDetail";
import { AnalysisList } from "@/components/analysis/AnalysisList";
import { analysis, failed, finished, NO_CHART, NONE, PARTY, running, WITNESS } from "@/components/analysis/fixtures";
import { UploadForm } from "@/components/analysis/UploadForm";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";

// 개발 전용 화면 점검 경로다. 로그인 없이 예시 데이터로 각 상태를 그린다.
const STATES = {
  party: finished(PARTY),
  witness: finished(WITNESS),
  none: finished(NONE),
  "no-chart": finished(NO_CHART),
  queued: analysis({ status: "queued" }),
  scan: running(1),
  observe: running(4),
  failed: failed("VIDEO_TOO_LONG", "영상이 너무 깁니다. 120초 이하의 영상만 분석할 수 있습니다.", 0),
  "failed-late": failed("INTERNAL_ERROR", "분석 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", 4),
  created: analysis({ status: "created" }),
};

export default function AnalysisPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state = "party" } = use(searchParams);
  const fixture = STATES[state as keyof typeof STATES];

  return (
    <>
      <Nav />
      <main className="frame min-h-[60vh]">
        {state === "upload" ? (
          <UploadForm />
        ) : state === "list" ? (
          <AnalysisList items={Object.values(STATES).map((a, i) => ({ ...a, id: i + 1 }))} />
        ) : (
          <AnalysisView analysis={fixture ?? STATES.party} onDelete={() => {}} />
        )}
      </main>
      <Footer />
    </>
  );
}
