// 메모리 파일시스템으로 expo-file-system을 대신한다.
const mockFs = new Map<string, string>();
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/').replace(/\/+/g, '/');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.has(this.uri);
    }
    get name() {
      return this.uri.split('/').pop()!;
    }
    textSync() {
      const text = mockFs.get(this.uri);
      if (text === undefined) throw new Error('없는 파일');
      return text;
    }
    write(s: string) {
      mockFs.set(this.uri, s);
    }
    copy(dest: File) {
      mockFs.set(dest.uri, mockFs.get(this.uri) ?? '');
    }
    delete() {
      mockFs.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    create() {}
    get exists() {
      return [...mockFs.keys()].some((k) => k.startsWith(`${this.uri}/`));
    }
    list() {
      return [...mockFs.keys()].filter((k) => k.startsWith(`${this.uri}/`)).map((k) => new File(k));
    }
  }
  return { File, Directory, Paths: { document: { uri: 'doc' } } };
});

import { addScenePhoto, deleteScenePhoto, getInsurerPhone, listScenePhotos, setInsurerPhone } from './scene-store';

beforeEach(() => {
  mockFs.clear();
  mockFs.set('src.jpg', 'img');
});

test('saves_photo_without_location', async () => {
  const p = await addScenePhoto('src.jpg', '2026-11-07T01:00:00Z', null);
  expect(p.location).toBeNull();
  expect(mockFs.get(p.uri)).toBe('img');
  expect(await listScenePhotos()).toEqual([p]);
});

test('lists_newest_first', async () => {
  await addScenePhoto('src.jpg', '2026-11-07T01:00:00Z', null);
  await addScenePhoto('src.jpg', '2026-11-07T03:00:00Z', { lat: 1, lng: 2 });
  await addScenePhoto('src.jpg', '2026-11-07T02:00:00Z', null);
  expect((await listScenePhotos()).map((p) => p.takenAt.slice(11, 13))).toEqual(['03', '02', '01']);
});

test('delete_removes_file_and_entry', async () => {
  const p = await addScenePhoto('src.jpg', '2026-11-07T01:00:00Z', null);
  await deleteScenePhoto(p.id);
  expect(mockFs.has(p.uri)).toBe(false);
  expect(mockFs.has(`doc/scene/${p.id}.json`)).toBe(false);
  expect(await listScenePhotos()).toEqual([]);
});

test('corrupt_metadata_keeps_photo', async () => {
  const p = await addScenePhoto('src.jpg', '2026-11-07T01:00:00Z', { lat: 1, lng: 2 });
  const other = await addScenePhoto('src.jpg', '2026-11-07T02:00:00Z', null);
  mockFs.set(`doc/scene/${p.id}.json`, '{not json');
  const list = await listScenePhotos();
  expect(list.map((x) => x.id).sort()).toEqual([p.id, other.id].sort());
  expect(list.find((x) => x.id === p.id)?.location).toBeNull();
});

test('rejects_empty_insurer_phone', async () => {
  await expect(setInsurerPhone('  ')).rejects.toThrow();
  expect(await getInsurerPhone()).toBeNull();
  await setInsurerPhone(' 1588-0000 ');
  expect(await getInsurerPhone()).toBe('1588-0000');
});
