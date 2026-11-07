import { Badge } from "@/components/ui/Badge";
import { EvidenceLink } from "./EvidenceLink";
import type { Seek, SeriousViolation } from "./types";

const LIKELIHOOD = {
  high: { label: "가능성 높음", tone: "danger" },
  medium: { label: "가능성 있음", tone: "accent" },
  low: { label: "가능성 낮음", tone: "neutral" },
  unknown: { label: "영상으로 알 수 없음", tone: "neutral" },
} as const;

export function ViolationList({ items, onSeek }: { items: SeriousViolation[]; onSeek?: Seek }) {
  return (
    <ul className="divide-y divide-line px-5 md:px-10">
      {items.map((v) => (
        <li key={v.item} className="flex flex-col gap-1 py-4 sm:grid sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
          <span className="font-semibold">{v.item}</span>
          <span className="flex items-baseline gap-2 text-sm text-muted">
            {v.evidence && (
              <>
                <EvidenceLink t={v.evidence.t} onSeek={onSeek} />
                <span>{v.evidence.text}</span>
              </>
            )}
          </span>
          <Badge tone={LIKELIHOOD[v.likelihood].tone}>{LIKELIHOOD[v.likelihood].label}</Badge>
        </li>
      ))}
    </ul>
  );
}
