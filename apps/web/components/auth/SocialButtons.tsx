"use client";

import { useSignIn } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { rememberRedirect } from "./redirect";
import { useAction } from "./useAction";

const ICON = { width: 20, height: 20, "aria-hidden": true } as const;

// 켜 둔 공급자만, 이 순서로 보인다. 각 공급자의 공식 로고 모양을 쓴다.
const PROVIDERS: { strategy: "oauth_google" | "oauth_apple" | "oauth_facebook"; label: string; icon: ReactNode }[] = [
  {
    strategy: "oauth_google",
    label: "Google로 계속하기",
    icon: (
      <svg {...ICON} viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    ),
  },
  {
    strategy: "oauth_apple",
    label: "Apple로 계속하기",
    icon: (
      <svg {...ICON} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      </svg>
    ),
  },
  {
    strategy: "oauth_facebook",
    label: "Facebook으로 계속하기",
    icon: (
      <svg {...ICON} viewBox="0 0 24 24" fill="#0866FF">
        <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
      </svg>
    ),
  },
];

/** 로그인과 가입 화면에서 같이 쓴다. 처음 보는 계정은 콜백에서 가입으로 이어진다. */
export function SocialButtons({ redirectUrl }: { redirectUrl: string }) {
  const { signIn } = useSignIn();
  const { pending, error, run } = useAction();

  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map(({ strategy, label, icon }) => (
        <Button
          key={strategy}
          variant="secondary"
          size="lg"
          full
          disabled={pending}
          onClick={() => {
            rememberRedirect(redirectUrl);
            return run(() => signIn.sso({ strategy, redirectCallbackUrl: "/sso-callback", redirectUrl }));
          }}
        >
          {/* 글 길이가 달라도 아이콘과 글의 시작 위치를 맞춘다 */}
          <span className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2 text-left">
            {icon}
            {label}
          </span>
        </Button>
      ))}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
