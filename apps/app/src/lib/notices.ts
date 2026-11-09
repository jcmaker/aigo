import { analysisTitle, faultRange, FAILURES, type Analysis } from './analysis';

export type Notice = { id: string; analysisId: number; kind: 'done' | 'failed'; title: string; body: string; at: string };

/**
 * 서버에 알림 저장소가 없어서, 끝난 분석(완료·실패)을 알림으로 보여 준다. 푸시와 같은 사건이다.
 * id에 상태를 넣어 같은 분석이 다시 끝나도(재분석) 새 알림이 된다.
 */
export function toNotices(items: Analysis[]): Notice[] {
  return items
    .filter((a) => a.status === 'done' || a.status === 'failed')
    .map((a): Notice => {
      if (a.status === 'failed') {
        return { id: `${a.id}:failed`, analysisId: a.id, kind: 'failed', title: '분석하지 못했어요', body: FAILURES[a.error?.code ?? '']?.title ?? analysisTitle(a), at: a.created_at };
      }
      const fault = a.report?.fault;
      return { id: `${a.id}:done`, analysisId: a.id, kind: 'done', title: '분석이 끝났어요', body: fault ? `${analysisTitle(a)} · 내 과실 ${faultRange(fault)}` : analysisTitle(a), at: a.created_at };
    })
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}

/** 방금 전, 5분 전, 3시간 전, 어제, 2일 전, 그보다 오래되면 날짜 */
export function timeAgo(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
}

const seoulDay = (d: Date) => d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
export const isToday = (iso: string, now: Date) => seoulDay(new Date(iso)) === seoulDay(now);
