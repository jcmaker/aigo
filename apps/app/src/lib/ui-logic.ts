export type Seg = 'on' | 'soft' | 'off';

// 과실 게이지: n칸 중 [min, max]와 겹치는 칸을 켠다. 점 범위는 그 값의 칸 하나.
export function faultSegments(min: number, max: number, n = 10): Seg[] {
  const w = 100 / n;
  const point = Math.min(Math.floor(min / w), n - 1);
  return Array.from({ length: n }, (_, i): Seg => {
    const on = min === max ? i === point : w * i < max && w * i + w > min;
    return on ? 'on' : 'off';
  });
}

// 내 분석 목록 필터. 진행 중은 아직 레포트가 없는 분석(업로드 미완료, 대기, 분석 중)이고, 실패는 전체에서만 보인다.
export type ListFilter = 'all' | 'done' | 'running';
export const matches = (f: ListFilter, status: string) =>
  f === 'all' || (f === 'done' ? status === 'done' : ['created', 'queued', 'processing'].includes(status));

// 홈 "최근 분석": 가장 최근 분석 1건을 올린 지 2주(14일) 안일 때만 보인다. 오래된 분석이 홈 맨 위를 계속 차지하지 않게 한다(전체 목록은 내 분석 탭).
export const HOME_RECENT_DAYS = 14;
export function homeRecent<T extends { created_at: string }>(items: T[], now = Date.now(), days = HOME_RECENT_DAYS): T | null {
  const latest = items[0];
  if (!latest) return null;
  const at = Date.parse(latest.created_at);
  return Number.isNaN(at) || now - at > days * 86_400_000 ? null : latest;
}
