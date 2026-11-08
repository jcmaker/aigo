const STORE_KEY = "aigo:after-auth";

/** 사이트 내부 경로만 허용한다. 그 밖(외부 URL, //host, 스킴)은 "/"로 돌린다. */
export function safeRedirect(input: string | string[] | null | undefined): string {
  // ?redirect_url=a&redirect_url=b 처럼 겹치면 첫 값만 본다.
  const raw = Array.isArray(input) ? input[0] : input;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  try {
    return new URL(raw, "http://local.invalid").origin === "http://local.invalid" ? raw : "/";
  } catch {
    return "/";
  }
}

export const TASK_MESSAGE = "계정 설정을 더 마쳐야 합니다. 잠시 후 다시 로그인해 주세요.";

/** finalize({navigate})에 넘기는 이동 함수. 세션 작업이 남아 있으면 이동하지 않는다. */
export function navigateTo(push: (url: string) => void, dest: string, onTask?: () => void) {
  return ({ session, decorateUrl }: { session: { currentTask?: unknown } | null; decorateUrl: (u: string) => string }) => {
    if (session?.currentTask) return onTask?.();
    const url = decorateUrl(safeRedirect(dest));
    if (url.startsWith("http")) window.location.href = url;
    else push(url);
  };
}

// 소셜 로그인은 외부 사이트를 거치므로 돌아올 곳을 탭 저장소에 잠시 둔다.
export function rememberRedirect(dest: string) {
  try {
    sessionStorage.setItem(STORE_KEY, safeRedirect(dest));
  } catch {}
}

// 지우지 않는다. 콜백이 두 번 불려도 같은 곳으로 보내야 하고, 다음 소셜 로그인이 값을 덮어쓴다.
export function readRedirect(): string {
  try {
    return safeRedirect(sessionStorage.getItem(STORE_KEY));
  } catch {
    return "/";
  }
}
