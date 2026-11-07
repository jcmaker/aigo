import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "회원가입 | AIGO" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string | string[] }> }) {
  const { redirect_url } = await searchParams;
  return (
    <AuthShell eyebrow="회원가입" title="계정 만들기" description="이메일로 가입하고 사고 영상을 분석해 보세요.">
      <SignupForm redirectUrl={redirect_url} />
    </AuthShell>
  );
}
