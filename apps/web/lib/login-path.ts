/** 전체 주소가 아니라 내부 경로로 넘긴다. safeRedirect는 전체 주소를 외부 주소로 보고 막는다. */
export function loginPath(pathname: string, search: string) {
  return `/login?redirect_url=${encodeURIComponent(pathname + search)}`;
}
