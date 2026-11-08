import { ClerkProvider } from "@clerk/nextjs";
import { GeistMono } from "geist/font/mono";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { DesignProvider } from "@/components/ui/DesignToggle";
import { DESIGN_COOKIE, parseDesign } from "@/lib/design";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIGO",
  description: "사고를 판정하는 AI가 아니라 사고 대응력을 높이는 AI. AIGO의 사고 영상 분석과 DashPi 블랙박스.",
};

// 첫 그림 전에 저장된 테마를 적용해 화면이 깜빡이지 않게 한다.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // 서버가 첫 HTML에 넣어 화면이 깜빡이지 않는다. 쿠키를 읽으므로 모든 화면이 요청마다 렌더링된다.
  const design = parseDesign((await cookies()).get(DESIGN_COOKIE)?.value) ?? "classic";

  return (
    <html lang="ko" className={GeistMono.variable} data-design={design} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ClerkProvider signInUrl="/login" signUpUrl="/signup">
          <DesignProvider design={design}>{children}</DesignProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
