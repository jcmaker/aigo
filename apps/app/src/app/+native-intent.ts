// 다른 앱의 공유 메뉴로 열리면(aigo://expo-sharing) 공유 화면으로 보낸다. 그 밖의 딥링크는 그대로 둔다.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const host = new URL(path).hostname;
    if (host === 'expo-sharing') return '/share';
    if (host === 'callback') return '/'; // 소셜 로그인 복귀. 실제 라우트가 없어 Unmatched Route가 되지 않게 한다.
  } catch {
    // URL이 아닌 경로(/upload 등)는 그대로 둔다.
  }
  return path;
}
