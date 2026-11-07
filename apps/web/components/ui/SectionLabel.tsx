import type { ReactNode } from "react";

type Props = { index: string; aside?: string; children: ReactNode };

/** frame 안 섹션 머리. 스크롤하면 위 막대 아래에 붙는다. */
export function SectionLabel({ index, aside, children }: Props) {
  return (
    <div className="sticky top-12 z-30 border-y border-line bg-bg/90 backdrop-blur-md">
      <span aria-hidden className="tick -top-1.5 -left-1.5 max-[1300px]:hidden" />
      <span aria-hidden className="tick -top-1.5 -right-1.5 max-[1300px]:hidden" />
      <div className="flex items-center justify-between gap-4 px-5 py-3 md:px-10">
        <p className="hud text-muted">
          <span className="text-accent-ink">{index}/</span> {children}
        </p>
        {aside && <p className="hud hidden text-muted sm:block">{aside}</p>}
      </div>
    </div>
  );
}
