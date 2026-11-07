"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useApi } from "@/lib/api";
import { buttonClass, Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { PASSWORD_HINT } from "./SignupForm";
import { useAction } from "./useAction";

const WITHDRAW_PHRASE = "탈퇴합니다";

function Section({ title, tone, children }: { title: string; tone?: "danger"; children: ReactNode }) {
  return (
    <section className={`border-t px-5 py-8 md:px-10 ${tone === "danger" ? "border-danger" : "border-line"}`}>
      <h2 className={`hud ${tone === "danger" ? "text-danger" : "text-muted"}`}>{title}</h2>
      <div className="mt-5 flex max-w-md flex-col gap-4">{children}</div>
    </section>
  );
}

function Profile({ user }: { user: NonNullable<ReturnType<typeof useUser>["user"]> }) {
  const { signOut } = useClerk();
  const { request } = useApi();
  const [name, setName] = useState(user.fullName ?? "");
  const [saved, setSaved] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [phrase, setPhrase] = useState("");
  const rename = useAction();
  const photo = useAction();
  const password = useAction();
  const leave = useAction();

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    // 입력값은 실패해도 지우지 않는다. 한 칸짜리 이름이라 성은 비운다.
    setSaved(await rename.run(() => user.update({ firstName: name.trim(), lastName: "" }).then(() => undefined)));
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordChanged(false);
    const ok = await password.run(() =>
      user.updatePassword({ currentPassword: current, newPassword: next, signOutOfOtherSessions: true }).then(() => undefined),
    );
    if (ok) {
      setCurrent("");
      setNext("");
    }
    setPasswordChanged(ok);
  }

  return (
    <>
      <Section title="계정">
        <div className="flex items-center gap-4">
          {user.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.imageUrl} alt="" width={64} height={64} className="size-16 rounded-app border border-line object-cover" />
          )}
          <p className="min-w-0 font-semibold break-all">{user.primaryEmailAddress?.emailAddress}</p>
        </div>
        <label className="text-[13px] font-semibold">
          프로필 사진 바꾸기
          <input
            type="file"
            accept="image/*"
            className="mt-1.5 block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-app file:border file:border-line-strong file:bg-raised file:px-3 file:font-semibold file:text-ink"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void photo.run(() => user.setProfileImage({ file }).then(() => undefined));
            }}
          />
        </label>
        {photo.error && <Notice tone="danger">{photo.error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Link href="/account/orders" className={buttonClass({ variant: "secondary" })}>
            주문 내역
          </Link>
          <Button variant="secondary" onClick={() => signOut({ redirectUrl: "/" })}>
            로그아웃
          </Button>
        </div>
      </Section>

      <Section title="프로필">
        <form onSubmit={saveName} className="flex flex-col gap-4">
          <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          {rename.error && <Notice tone="danger">{rename.error}</Notice>}
          {saved && <Notice>저장했습니다.</Notice>}
          <Button type="submit" loading={rename.pending}>
            이름 저장
          </Button>
        </form>
      </Section>

      {user.passwordEnabled && (
        <Section title="비밀번호">
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <Field
              label="현재 비밀번호"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <Field
              label="새 비밀번호 입력"
              type="password"
              autoComplete="new-password"
              hint={PASSWORD_HINT}
              minLength={15}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            {password.error && <Notice tone="danger">{password.error}</Notice>}
            {passwordChanged && <Notice>비밀번호를 바꿨습니다. 다른 기기에서는 로그아웃됩니다.</Notice>}
            <Button type="submit" variant="secondary" loading={password.pending}>
              비밀번호 변경
            </Button>
          </form>
        </Section>
      )}

      <Section title="회원 탈퇴" tone="danger">
        <p className="text-sm text-muted">
          탈퇴하면 계정과 분석 기록이 삭제되고 되돌릴 수 없습니다. 계속하려면 아래에 <b className="text-ink">{WITHDRAW_PHRASE}</b>를
          입력해 주세요.
        </p>
        <Field label="확인 문구" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
        {leave.error && <Notice tone="danger">{leave.error}</Notice>}
        <Button
          variant="danger"
          disabled={phrase !== WITHDRAW_PHRASE}
          loading={leave.pending}
          onClick={() =>
            leave.run(async () => {
              await request("/api/v1/me", { method: "DELETE" });
              await signOut({ redirectUrl: "/" });
            })
          }
        >
          회원 탈퇴
        </Button>
      </Section>
    </>
  );
}

export function AccountPanel() {
  const { isLoaded, user } = useUser();
  if (!isLoaded || !user) {
    return (
      <div className="px-5 py-8 md:px-10">
        <Skeleton className="h-40 w-full max-w-md" />
      </div>
    );
  }
  return <Profile user={user} />;
}
