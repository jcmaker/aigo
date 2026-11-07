import type { ReactNode } from "react";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";

type Props = { eyebrow: string; title: string; description?: string; children: ReactNode };

/** 인증 화면 공통 틀. 화면 가운데에 좁은 폼 한 줄을 놓는다. */
export function AuthShell({ eyebrow, title, description, children }: Props) {
  return (
    <>
      <Nav />
      <main className="frame flex min-h-[72vh] justify-center px-5 py-12 md:py-20">
        <div className="w-full max-w-[26rem]">
          <p className="hud text-muted">{eyebrow}</p>
          <h1 className="mt-3 text-3xl leading-tight font-extrabold tracking-[-0.03em] text-ink-strong">{title}</h1>
          {description && <p className="mt-3 text-muted">{description}</p>}
          <div className="mt-8 flex flex-col gap-5">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
