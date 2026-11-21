import { STAGES, type Analysis } from './analysis';

// ponytail: 추정값. 운영 로그로 단계별 중앙값을 재면 바꾼다.
export const EXPECTED_SEC: Record<string, number> = { normalize: 5, scan: 20, locate: 5, focus: 3, observe: 30, assess: 25 };
const HINT_SEC = 2.6;
const MAX_STAGE_SHARE = 0.9; // 진행 중 단계는 한 칸을 다 채우지 않는다. 100%는 완료 때만.

export type Live = { current: number; finished: boolean; elapsedSec: number | null; stageSec: number | null; ratio: number };

const since = (iso: string | null | undefined, nowMs: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((nowMs - t) / 1000)); // 시계 차이로 음수면 0
};

/** 서버 progress의 단계 시각으로 지금 화면에 보일 진행을 계산한다. 시각은 인자로 받아 테스트한다. */
// startMs: 화면이 본 가장 이른 시작 시각. 첫 단계가 끝나면 서버가 그 시각을 완료 시각으로 덮어써 경과가 줄어 보이지 않게 한다.
export function liveProgress(a: Pick<Analysis, 'status' | 'stage' | 'progress'>, nowMs: number, startMs?: number): Live {
  const finished = a.status === 'done';
  const current = STAGES.findIndex((s) => s.id === a.stage);
  const first = a.progress[0];
  const elapsedSec = startMs !== undefined ? Math.max(0, Math.floor((nowMs - startMs) / 1000)) : first ? since(first.at, nowMs) : null;
  const entry = a.progress.find((p) => p.stage === a.stage && p.status === 'running');
  const stageSec = entry ? since(entry.at, nowMs) : null;
  if (finished) return { current, finished, elapsedSec, stageSec, ratio: 1 };
  const share = current >= 0 && stageSec !== null ? Math.min(stageSec / (EXPECTED_SEC[a.stage!] ?? 20), MAX_STAGE_SHARE) : 0;
  const ratio = current >= 0 ? (current + share) / STAGES.length : 0;
  return { current, finished, elapsedSec, stageSec, ratio };
}

export function hintAt(stageIndex: number, stageSec: number): string {
  const hints = STAGES[stageIndex]?.hints ?? [];
  return hints[Math.floor(stageSec / HINT_SEC) % hints.length] ?? '';
}
