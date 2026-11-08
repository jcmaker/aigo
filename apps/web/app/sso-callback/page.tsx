"use client";

import { HandleSSOCallback } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { navigateTo, readRedirect, TASK_MESSAGE } from "@/components/auth/redirect";

// 소셜 로그인에서 돌아오는 곳. 추가 단계가 필요하면 로그인/가입 화면이 이어받는다.
export default function SsoCallbackPage() {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center px-5">
      {stuck ? <Notice tone="danger">{TASK_MESSAGE}</Notice> : <p className="hud text-muted">로그인 확인 중</p>}
      <HandleSSOCallback
        navigateToApp={(params) => navigateTo(router.push, readRedirect(), () => setStuck(true))(params)}
        navigateToSignIn={() => router.push("/login")}
        navigateToSignUp={() => router.push("/signup")}
      />
    </main>
  );
}
