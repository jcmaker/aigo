import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { DESIGN_COOKIE, DESIGN_MAX_AGE, parseDesign } from "./lib/design";
import { loginPath } from "./lib/login-path";

const PROTECTED = ["/account", "/analyses", "/checkout"];

// 프록시 뒤에서는 req.url의 호스트가 공개 주소와 다를 수 있어 전달 헤더로 만든다.
function publicUrl(req: NextRequest, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}

// ?design=poster 주소를 공유해 시연한다. 쿠키를 쓰고 파라미터 없는 주소로 보낸다.
function designRedirect(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const design = parseDesign(searchParams.get("design"));
  if (!design) return;
  const rest = new URLSearchParams(searchParams);
  rest.delete("design");
  const query = rest.size ? `?${rest}` : "";
  const res = NextResponse.redirect(publicUrl(req, pathname + query));
  res.cookies.set(DESIGN_COOKIE, design, { path: "/", maxAge: DESIGN_MAX_AGE, sameSite: "lax" });
  return res;
}

// 화면 진입만 막는다. 데이터 권한은 API가 Bearer 토큰으로 따로 확인한다.
export default clerkMiddleware(
  async (auth, req) => {
    const { pathname, search } = req.nextUrl;
    // 보호 경로의 파라미터는 건드리지 않아 로그인 뒤 돌아갈 주소가 그대로 남는다.
    if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return designRedirect(req);
    const { userId } = await auth();
    if (userId) return;
    return NextResponse.redirect(publicUrl(req, loginPath(pathname, search)));
  },
  { signInUrl: "/login", signUpUrl: "/signup" },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/(.*)",
  ],
};
