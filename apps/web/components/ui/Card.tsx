import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  index?: string;
  badge?: ReactNode;
  href?: string;
  children?: ReactNode;
};

/** .cells 안에서는 칸 선을 쓰고, 혼자 놓이면 자기 테두리를 쓴다. */
export function Card({ title, index, badge, href, children }: Props) {
  return (
    <article className="group relative flex flex-col rounded-app border border-line bg-bg transition-colors duration-[var(--dur-hover)] in-[.cells]:rounded-none in-[.cells]:border-0 has-[a:hover]:bg-raised">
      {(index || badge) && (
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-5">
          <span className="hud text-muted">{index}</span>
          {badge}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-xl leading-snug font-bold tracking-[-0.02em] text-ink-strong">
          {href ? (
            <Link
              href={href}
              className="transition-colors duration-[var(--dur-hover)] group-has-[a:hover]:text-accent-ink after:absolute after:inset-0"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        {children && <div className="text-muted">{children}</div>}
      </div>
    </article>
  );
}
