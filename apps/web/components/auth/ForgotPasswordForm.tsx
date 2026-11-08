"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { CodeForm } from "./CodeForm";
import { navigateTo, TASK_MESSAGE } from "./redirect";
import { PASSWORD_HINT } from "./SignupForm";
import { useAction } from "./useAction";

/** 이메일 입력, 코드 확인, 새 비밀번호 순서(Clerk resetPasswordEmailCode). */
export function ForgotPasswordForm() {
  const router = useRouter();
  const { signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<"email" | "code" | "password">("email");
  const send = useAction();
  const reset = useAction();

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    await send.run(async () => {
      const made = await signIn.create({ identifier: email });
      if (made.error) return made;
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) return sent;
      setPhase("code");
    });
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    await reset.run(async () => {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
      if (error) return { error };
      if (signIn.status !== "complete") throw new Error(`incomplete: ${signIn.status}`);
      return signIn.finalize({ navigate: navigateTo(router.push, "/", () => reset.fail(TASK_MESSAGE)) });
    });
  }

  if (phase === "code") {
    return (
      <CodeForm
        email={email}
        backLabel="이메일 다시 입력"
        onVerify={async (code) => {
          const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
          if (error) return { error };
          setPhase("password");
        }}
        onResend={() => signIn.resetPasswordEmailCode.sendCode()}
        onBack={async () => {
          await signIn.reset();
          setPhase("email");
        }}
      />
    );
  }

  if (phase === "password") {
    return (
      <form onSubmit={submitPassword} className="flex flex-col gap-5">
        <Field
          label="새 비밀번호"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          minLength={15}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
        {reset.error && <Notice tone="danger">{reset.error}</Notice>}
        <Button type="submit" size="lg" full loading={reset.pending}>
          비밀번호 바꾸기
        </Button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={sendCode} className="flex flex-col gap-5">
        <Field label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {send.error && <Notice tone="danger">{send.error}</Notice>}
        <Button type="submit" size="lg" full loading={send.pending}>
          코드 보내기
        </Button>
      </form>
      <Link href="/login" className="text-[13px] text-muted underline underline-offset-4">
        로그인으로 돌아가기
      </Link>
    </>
  );
}
