import { File, Paths } from 'expo-file-system';

// 읽은 알림 id. 폰에만 둔다. 파일이 없거나 깨지면 모두 안 읽은 것으로 본다.
const file = () => new File(Paths.document, 'notices-seen.json');
const KEEP = 300;

export async function getSeenNotices(): Promise<Set<string>> {
  try {
    const f = file();
    const list = f.exists ? JSON.parse(f.textSync()) : [];
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function markNoticesSeen(ids: string[]): Promise<void> {
  try {
    const seen = await getSeenNotices();
    ids.forEach((id) => seen.add(id));
    file().write(JSON.stringify([...seen].slice(-KEEP)));
  } catch {
    // 읽음 표시는 실패해도 화면에 영향이 없다.
  }
}
