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

// 진행 단계 막대: 끝난 칸 on, 진행 중인 현재 칸 soft.
export function stageSegments(stageIndex: number, total: number, state: 'running' | 'done' | 'failed'): Seg[] {
  return Array.from({ length: total }, (_, i): Seg => {
    if (state === 'done') return 'on';
    if (i < stageIndex) return 'on';
    return state === 'running' && i === stageIndex ? 'soft' : 'off';
  });
}

// 내 분석 목록 필터. 진행 중은 아직 레포트가 없는 분석(업로드 미완료, 대기, 분석 중)이고, 실패는 전체에서만 보인다.
export type ListFilter = 'all' | 'done' | 'running';
export const matches = (f: ListFilter, status: string) =>
  f === 'all' || (f === 'done' ? status === 'done' : ['created', 'queued', 'processing'].includes(status));
