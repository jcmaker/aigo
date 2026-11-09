import { Directory, File, Paths } from 'expo-file-system';

export type SceneLocation = { lat: number; lng: number };
export type ScenePhoto = { id: string; uri: string; takenAt: string; location: SceneLocation | null };

// 사진마다 {id}.jpg와 {id}.json을 둔다. 공용 목록이 깨져 증거 사진이 통째로 사라지는 일을 막는다.
type Meta = { takenAt: string; location: SceneLocation | null };

const dir = () => new Directory(Paths.document, 'scene');
const insurerFile = () => new File(dir(), 'insurer.txt');
const contactsFile = () => new File(dir(), 'contacts.json');
const metaFile = (id: string) => new File(dir(), `${id}.json`);

/** 메타 파일이 없거나 깨져도 사진은 보여 준다. id 앞부분이 촬영 시각이다. */
function readMeta(id: string): Meta {
  try {
    const m = JSON.parse(metaFile(id).textSync());
    if (typeof m?.takenAt === 'string') return { takenAt: m.takenAt, location: m.location ?? null };
  } catch {
    // 아래 기본값을 쓴다.
  }
  return { takenAt: new Date(Number(id.split('-')[0]) || 0).toISOString(), location: null };
}

export async function addScenePhoto(uri: string, takenAt: string, location: SceneLocation | null): Promise<ScenePhoto> {
  dir().create({ idempotent: true, intermediates: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const photo = new File(dir(), `${id}.jpg`);
  new File(uri).copy(photo);
  metaFile(id).write(JSON.stringify({ takenAt, location }));
  return { id, uri: photo.uri, takenAt, location };
}

export async function listScenePhotos(): Promise<ScenePhoto[]> {
  if (!dir().exists) return [];
  return dir()
    .list()
    .filter((f) => f.name.endsWith('.jpg'))
    .map((f) => {
      const id = f.name.slice(0, -'.jpg'.length);
      return { id, uri: f.uri, ...readMeta(id) };
    })
    .sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0));
}

export async function deleteScenePhoto(id: string): Promise<void> {
  for (const f of [new File(dir(), `${id}.jpg`), metaFile(id)]) {
    if (f.exists) f.delete();
  }
}

export async function getInsurerPhone(): Promise<string | null> {
  try {
    const f = insurerFile();
    return f.exists ? f.textSync().trim() || null : null;
  } catch {
    return null;
  }
}

export async function setInsurerPhone(phone: string): Promise<void> {
  const p = phone.trim();
  if (!p) throw new Error('보험사 번호를 입력해 주세요.');
  dir().create({ idempotent: true, intermediates: true });
  insurerFile().write(p);
}

export type Contact = { id: string; name: string; relation: string; phone: string };
export const MAX_CONTACTS = 5;

/** 사고 때 알릴 사람. 폰에만 저장한다. 파일이 깨지면 빈 목록으로 본다. */
export async function getContacts(): Promise<Contact[]> {
  try {
    const f = contactsFile();
    if (!f.exists) return [];
    const list = JSON.parse(f.textSync());
    return Array.isArray(list) ? list.filter((c) => typeof c?.name === 'string' && typeof c?.phone === 'string') : [];
  } catch {
    return [];
  }
}

export async function addContact(name: string, relation: string, phone: string): Promise<Contact[]> {
  const n = name.trim();
  const p = phone.trim();
  if (!n) throw new Error('이름을 입력해 주세요.');
  if (p.replace(/\D/g, '').length < 3) throw new Error('전화번호를 확인해 주세요.');
  const list = await getContacts();
  if (list.length >= MAX_CONTACTS) throw new Error(`연락처는 ${MAX_CONTACTS}명까지 저장할 수 있습니다.`);
  const next = [...list, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: n, relation, phone: p }];
  dir().create({ idempotent: true, intermediates: true });
  contactsFile().write(JSON.stringify(next));
  return next;
}

export async function removeContact(id: string): Promise<Contact[]> {
  const next = (await getContacts()).filter((c) => c.id !== id);
  dir().create({ idempotent: true, intermediates: true });
  contactsFile().write(JSON.stringify(next));
  return next;
}
