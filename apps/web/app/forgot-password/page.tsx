import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "비밀번호 재설정 | AIGO" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell eyebrow="비밀번호 재설정" title="비밀번호를 잊으셨나요?" description="가입한 이메일로 인증 코드를 보내 드립니다.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
