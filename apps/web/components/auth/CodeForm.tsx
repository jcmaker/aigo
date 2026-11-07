"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useAction } from "./useAction";

type Result = Promise<{ error: unknown } | void>;
type Props = {
  email?: string;
  onVerify: (code: string) => Result;
  onResend: () => Result;
  onBack: () => void;
  backLabel: string;
};

/** 이메일 인증 코드 입력. 가입, 기기 인증, 비밀번호 재설정이 같이 쓴다. */
export function CodeForm({ email, onVerify, onResend, onBack, backLabel }: Props) {
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);
  const verify = useAction();
  const resend = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setResent(false);
    await verify.run(() => onVerify(code.trim()));
  }

  async function sendAgain() {
    setResent(false);
    verify.clear();
    setResent(await resend.run(onResend));
  }

  const error = verify.error ?? resend.error;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field
        label="인증 코드"
        hint={email ? `${email}로 보낸 코드를 입력해 주세요.` : "이메일로 보낸 코드를 입력해 주세요."}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        autoFocus
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {resent && <Notice>코드를 다시 보냈습니다.</Notice>}
      <Button type="submit" size="lg" full loading={verify.pending}>
        확인
      </Button>
      <div className="flex justify-between gap-3 text-[13px]">
        <button type="button" onClick={sendAgain} disabled={resend.pending} className="font-semibold underline underline-offset-4 disabled:opacity-50">
          코드 다시 보내기
        </button>
        <button type="button" onClick={onBack} className="text-muted underline underline-offset-4">
          {backLabel}
        </button>
      </div>
    </form>
  );
}
