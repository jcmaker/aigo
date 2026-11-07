import { formatTime } from "@/lib/format";
import type { Seek } from "./types";

const LOOK = "font-mono text-[13px] font-semibold whitespace-nowrap";

/** 재생할 영상이 없으면 시각만 글자로 남긴다. */
export function EvidenceLink({ t, onSeek }: { t: number; onSeek?: Seek }) {
  if (!onSeek) return <span className={`${LOOK} text-muted`}>{formatTime(t)}</span>;

  return (
    <button
      type="button"
      onClick={() => onSeek(t)}
      aria-label={`${formatTime(t)} 장면으로 이동`}
      className={`${LOOK} text-accent-ink underline underline-offset-4 transition-colors duration-[var(--dur-hover)] hover:text-ink-strong print:no-underline`}
    >
      {formatTime(t)}
    </button>
  );
}
