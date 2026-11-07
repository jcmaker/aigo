import type { ReactNode } from "react";

const TONES = {
  info: { tag: "bg-accent-ink text-invert-fg", box: "border-accent-ink", label: "안내" },
  danger: { tag: "bg-danger text-bg", box: "border-danger", label: "오류" },
};

type Props = { tone?: keyof typeof TONES; label?: string; children: ReactNode };

export function Notice({ tone = "info", label, children }: Props) {
  const look = TONES[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={`flex overflow-hidden rounded-app border bg-raised ${look.box}`}
    >
      <span className={`hud flex shrink-0 items-center px-3 ${look.tag}`}>{label ?? look.label}</span>
      <p className="min-w-0 px-4 py-3 text-sm">{children}</p>
    </div>
  );
}
