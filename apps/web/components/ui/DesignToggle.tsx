"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DESIGN_COOKIE, DESIGN_MAX_AGE, type Design } from "@/lib/design";

const DesignContext = createContext<Design>("classic");

/** Nav는 여러 화면에서 인자 없이 쓰이므로 레이아웃이 읽은 서버 값을 컨텍스트로 내린다. */
export function DesignProvider({ design, children }: { design: Design; children: ReactNode }) {
  return <DesignContext value={design}>{children}</DesignContext>;
}

export const useDesign = () => useContext(DesignContext);

export function DesignToggle({ design: server, className = "" }: { design: Design; className?: string }) {
  const router = useRouter();
  const [design, setDesign] = useState(server);

  // 누른 뒤에는 바로 바꾸고, 새로고침이 끝나면 서버 값을 따른다.
  useEffect(() => setDesign(server), [server]);

  const toggle = () => {
    const next: Design = design === "poster" ? "classic" : "poster";
    document.cookie = `${DESIGN_COOKIE}=${next}; path=/; max-age=${DESIGN_MAX_AGE}; samesite=lax`;
    setDesign(next);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={design === "poster" ? "기본 디자인으로 전환" : "포스터 디자인으로 전환"}
      className={className}
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M1.7 1.7h9v9h-9z" />
        <path d="M13.3 5.3h1v9h-9v-1" />
        <path fill="currentColor" stroke="none" d="M1.7 10.7 10.7 1.7v9z" />
      </svg>
    </button>
  );
}
