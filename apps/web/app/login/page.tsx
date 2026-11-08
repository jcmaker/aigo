import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "로그인 | AIGO" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string | string[] }> }) {
  const { redirect_url } = await searchParams;
  return (
    <AuthShell eyebrow="로그인" title="다시 만나서 반갑습니다" description="내 분석과 주문을 이어서 확인하세요.">
      <LoginForm redirectUrl={redirect_url} />
    </AuthShell>
  );
}
