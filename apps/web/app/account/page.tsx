import type { Metadata } from "next";
import { AccountPanel } from "@/components/auth/AccountPanel";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";

export const metadata: Metadata = { title: "내 정보 | AIGO" };

export default function AccountPage() {
  return (
    <>
      <Nav />
      <main className="frame min-h-[72vh]">
        <header className="px-5 py-10 md:px-10 md:py-14">
          <p className="hud text-muted">내 정보</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-ink-strong">계정과 프로필</h1>
        </header>
        <AccountPanel />
      </main>
      <Footer />
    </>
  );
}
