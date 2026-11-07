import type { ReactNode } from "react";

const TONES = { neutral: "text-muted", accent: "text-accent-ink", ok: "text-ok", danger: "text-danger" };

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`hud inline-flex w-fit items-center gap-2 whitespace-nowrap ${TONES[tone]}`}>
      <span aria-hidden className="size-1.5 bg-current" />
      <span>{children}</span>
    </span>
  );
}
