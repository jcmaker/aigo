import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { faultRange } from "./FaultBreakdown";
import { FAILURES, type Analysis } from "./types";

const STATUS = {
  created: { label: "업로드 미완료", tone: "neutral" },
  queued: { label: "대기 중", tone: "neutral" },
  processing: { label: "분석 중", tone: "accent" },
  done: { label: "완료", tone: "ok" },
  failed: { label: "실패", tone: "danger" },
} as const;

const date = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

function title({ id, status, report, error }: Analysis) {
  if (status === "failed") return FAILURES[error?.code ?? ""]?.title ?? "분석을 끝내지 못했습니다";
  if (!report) return `분석 #${id}`;
  if (report.involvement === "none") return "사고 장면 미확인";
  return report.accident_type ?? "사고 분석 결과";
}

export function AnalysisList({ items }: { items: Analysis[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 p-5 md:p-10">
        <p className="text-muted">아직 분석한 영상이 없습니다.</p>
        <Link href="/analyses/new" className={buttonClass()}>
          영상 올리기
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((a) => {
        const status = STATUS[a.status as keyof typeof STATUS] ?? STATUS.processing;
        const fault = a.report?.fault;
        return (
          <li key={a.id} className="relative transition-colors duration-[var(--dur-hover)] hover:bg-raised">
            <div className="flex flex-col gap-1 p-5 md:grid md:grid-cols-[9rem_minmax(0,1fr)_7rem_8rem] md:items-baseline md:gap-4 md:px-10">
              <span className="hud text-muted">#{a.id} · {date(a.created_at)}</span>
              <Link href={`/analyses/${a.id}`} className="font-semibold after:absolute after:inset-0">
                {title(a)}
              </Link>
              <span className="font-mono text-sm">{fault ? `내 과실 ${faultRange(fault)}` : ""}</span>
              <span className="md:justify-self-end">
                <Badge tone={status.tone}>{status.label}</Badge>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
