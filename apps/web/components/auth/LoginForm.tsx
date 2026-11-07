"use client";

import { useAuth, useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { CodeForm } from "./CodeForm";
import { clerkMessage } from "./clerkErrors";
import { navigateTo, safeRedirect, TASK_MESSAGE } from "./redirect";
import { SocialButtons } from "./SocialButtons";
import { useAction } from "./useAction";

export function LoginForm({ redirectUrl }: { redirectUrl?: string | string[] }) {
  const dest = safeRedirect(redirectUrl);
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn, errors } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<"form" | "code">("form");
  const login = useAction();

  useEffect(() => {
    if (isSignedIn) router.replace(dest);
  }, [isSignedIn, dest, router]);

  const finish = () => signIn.finalize({ navigate: navigateTo(router.push, dest, () => login.fail(TASK_MESSAGE)) });

  // 소셜 로그인에서 새 기기 확인이나 2단계가 남은 채 돌아오면 바로 코드 화면으로 간다.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || isSignedIn) return;
    if (signIn.status !== "needs_client_trust" && signIn.status !== "needs_second_factor") return;
    resumed.current = true;
    void login.run(async () => {
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) return sent;
      setPhase("code");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await login.run(async () => {
      const { error } = await signIn.password({ emailAddress: email, password });
      if (error) return { error };
      if (signIn.status === "complete") return finish();
      // 새 기기(needs_client_trust)와 2단계 인증은 이메일 코드로 확인한다.
      if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
        if (!signIn.supportedSecondFactors.some((f) => f.strategy === "email_code")) throw new Error("unsupported factor");
        const sent = await signIn.mfa.sendEmailCode();
        if (sent.error) return sent;
        setPhase("code");
        return;
      }
      throw new Error(`incomplete: ${signIn.status}`);
    });
  }

  const hookError = errors?.global?.[0] ? clerkMessage(errors.global[0]) : null;

  if (phase === "code") {
    return (
      <CodeForm
        email={email}
        backLabel="처음부터 다시"
        onVerify={async (code) => {
          const { error } = await signIn.mfa.verifyEmailCode({ code });
          if (error) return { error };
          if (signIn.status !== "complete") throw new Error(`incomplete: ${signIn.status}`);
          return finish();
        }}
        onResend={() => signIn.mfa.sendEmailCode()}
        onBack={async () => {
          await signIn.reset();
          setPhase("form");
        }}
      />
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {(login.error ?? hookError) && <Notice tone="danger">{login.error ?? hookError}</Notice>}
        <Button type="submit" size="lg" full loading={login.pending}>
          로그인
        </Button>
      </form>
      <div className="flex justify-between text-[13px]">
        <Link href="/forgot-password" className="text-muted underline underline-offset-4">
          비밀번호를 잊으셨나요?
        </Link>
        <Link href={`/signup${dest === "/" ? "" : `?redirect_url=${encodeURIComponent(dest)}`}`} className="font-semibold underline underline-offset-4">
          회원가입
        </Link>
      </div>
      <p className="hud text-muted">또는</p>
      <SocialButtons redirectUrl={dest} />
    </>
  );
}
