import { File, Paths } from 'expo-file-system';

/** 공유 PDF와 영상 복사본이 앱 캐시에 남지 않게 한다. 지우지 못한 파일은 OS 정리에 맡긴다. */
export function clearAppCache() {
  try {
    for (const entry of Paths.cache.list()) {
      try {
        entry.delete();
      } catch {
        // 다음 파일을 계속 지운다.
      }
    }
  } catch {
    // 캐시 폴더가 없으면 지울 것도 없다.
  }
}

export function deleteCached(uri: string) {
  try {
    if (uri.startsWith(Paths.cache.uri)) new File(uri).delete();
  } catch {
    // 이미 없으면 그만이다.
  }
}

export const deleteReportPdf = (id: string | number) => deleteCached(new File(Paths.cache, `AIGO-report-${id}.pdf`).uri);
