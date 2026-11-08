"use client";

import { useSignUp } from "@clerk/nextjs";
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

export const PASSWORD_HINT = "15자 이상으로 정해 주세요. 길수록 안전합니다.";

export function SignupForm({ redirectUrl }: { redirectUrl?: string | string[] }) {
  const dest = safeRedirect(redirectUrl);
  const router = useRouter();
  const { signUp, errors } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // 소셜 가입이나 새로고침으로 이미 진행 중인 가입이 있으면 남은 단계부터 보여 준다.
  const [phase, setPhase] = useState<"form" | "code" | "password" | "stuck">(() => startPhase(signUp));
  const create = useAction();
  const finish = () => signUp.finalize({ navigate: navigateTo(router.push, dest, () => create.fail(TASK_MESSAGE)) });

  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || phase !== "code") return;
    resumed.current = true;
    void create.run(() => signUp.verifications.sendEmailCode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hookError = errors?.global?.[0] ? clerkMessage(errors.global[0]) : null;

  async function afterPassword() {
    if (signUp.status === "complete") return finish();
    if (signUp.unverifiedFields?.includes("email_address")) {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return sent;
      setPhase("code");
      return;
    }
    throw new Error(`incomplete: ${signUp.status}`);
  }

  async function setNewPassword(e: FormEvent) {
    e.preventDefault();
    await create.run(async () => {
      const made = await signUp.password({ password });
      if (made.error) return made;
      return afterPassword();
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await create.run(async () => {
      const made = await signUp.password({ emailAddress: email, password });
      if (made.error) return made;
      return afterPassword();
    });
  }

  if (phase === "code") {
    return (
      <CodeForm
        email={email}
        backLabel="이메일 다시 입력"
        onVerify={async (code) => {
          const { error } = await signUp.verifications.verifyEmailCode({ code });
          if (error) return { error };
          if (signUp.status !== "complete") throw new Error(`incomplete: ${signUp.status}`);
          return finish();
        }}
        onResend={() => signUp.verifications.sendEmailCode()}
        onBack={async () => {
          await signUp.reset();
          setPhase("form");
        }}
      />
    );
  }

  if (phase === "password") {
    return (
      <form onSubmit={setNewPassword} className="flex flex-col gap-5">
        <Notice>소셜 계정으로 가입을 이어가는 중입니다. 사용할 비밀번호를 정해 주세요.</Notice>
        <Field
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          minLength={15}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
        {(create.error ?? hookError) && <Notice tone="danger">{create.error ?? hookError}</Notice>}
        <Button type="submit" size="lg" full loading={create.pending}>
          가입 마치기
        </Button>
      </form>
    );
  }

  if (phase === "stuck") {
    return (
      <div className="flex flex-col gap-5">
        <Notice tone="danger">{hookError ?? "진행 중인 가입에 필요한 정보가 더 남아 있습니다. 처음부터 다시 시작해 주세요."}</Notice>
        <Button
          size="lg"
          full
          onClick={async () => {
            await signUp.reset();
            setPhase("form");
          }}
        >
          처음부터 다시
        </Button>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          minLength={15}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {(create.error ?? hookError) && <Notice tone="danger">{create.error ?? hookError}</Notice>}
        <div id="clerk-captcha" />
        <Button type="submit" size="lg" full loading={create.pending}>
          가입하기
        </Button>
      </form>
      <p className="text-[13px] text-muted">
        이미 계정이 있나요?{" "}
        <Link href={`/login${dest === "/" ? "" : `?redirect_url=${encodeURIComponent(dest)}`}`} className="font-semibold text-ink underline underline-offset-4">
          로그인
        </Link>
      </p>
      <p className="hud text-muted">또는</p>
      <SocialButtons redirectUrl={dest} />
    </>
  );
}

type Pending = ReturnType<typeof useSignUp>["signUp"];

function startPhase(signUp: Pending): "form" | "code" | "password" | "stuck" {
  if (!signUp.id || signUp.status !== "missing_requirements") return "form";
  const missing = signUp.missingFields ?? [];
  if (missing.length === 0) return signUp.unverifiedFields?.includes("email_address") ? "code" : "form";
  if (missing.length === 1 && missing[0] === "password") return "password";
  return "stuck";
}
