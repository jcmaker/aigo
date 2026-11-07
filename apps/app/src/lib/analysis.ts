import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiFailure, useApi } from './api';
import type { components } from './api.gen';

type Schemas = components['schemas'];
export type Analysis = Schemas['AnalysisOut'];
export type Report = Schemas['Report'];
export type Evidence = Schemas['Evidence'];
export type FaultAssessment = Schemas['FaultAssessment'];

const POLL_MS = 3000;
// created는 업로드를 끝내지 않은 분석이라 저절로 바뀌지 않는다.
const SETTLED = new Set(['done', 'failed', 'created']);

/** 모델 출력이 아니라 화면 코드에 고정한다. 웹과 같은 문구다. */
export const DISCLAIMER = '영상 기반 AI 추정이며 법적 판단이 아닙니다';
export const LEVEL = { high: '높음', medium: '보통', low: '낮음' } as const;

export const LIKELIHOOD = {
  high: '가능성 높음',
  medium: '가능성 있음',
  low: '가능성 낮음',
  unknown: '영상으로 알 수 없음',
} as const;
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

const NEXT_DAY = '한국 시간 자정이 지나면 다시 올릴 수 있습니다.';
const NOT_COUNTED = '실패한 분석은 하루 한도에 세지 않습니다.';
const MODEL_FAILURE = { title: 'AI 분석을 끝내지 못했습니다', hint: `영상 문제가 아닐 수 있습니다. ${NOT_COUNTED}` };

export const FAILURES: Record<string, { title: string; hint: string; final?: boolean }> = {
  DAILY_LIMIT: { title: '오늘 올릴 수 있는 분석을 모두 썼습니다', hint: NEXT_DAY, final: true },
  SERVICE_LIMIT: { title: '오늘 서비스 분석이 마감됐습니다', hint: NEXT_DAY, final: true },
  UPLOAD_FAILED: { title: '영상을 올리지 못했습니다', hint: '다시 시도하면 같은 분석에 이어 올리므로 하루 한도를 더 쓰지 않습니다. 올린 지 15분이 지나 주소가 만료됐다면 새 분석이 만들어져 한도가 한 번 더 줄어듭니다.' },
  INVALID_TRIM: { title: '선택한 구간을 분석하지 못했습니다', hint: '구간을 다시 골라 영상을 새로 올려 주세요.' },
  UPLOAD_INCOMPLETE: { title: '영상이 끝까지 올라가지 않았습니다', hint: '다시 시도하면 처음부터 올립니다.' },
  INVALID_VIDEO: { title: '영상을 읽지 못했습니다', hint: '파일이 손상되지 않았는지 확인하고 다른 파일로 올려 주세요.' },
  VIDEO_TOO_LONG: { title: '영상이 너무 깁니다', hint: '충돌 앞뒤만 남기고 2분 이하로 잘라서 올려 주세요.' },
  UPLOAD_CHANGED: { title: '업로드한 영상이 바뀌었습니다', hint: '분석을 시작한 뒤 파일이 달라졌습니다. 영상을 새로 올려 주세요.' },
  INTERNAL_ERROR: { title: '분석 중 문제가 생겼습니다', hint: `영상 문제가 아닐 수 있습니다. ${NOT_COUNTED}` },
  WORKER_TIMEOUT: { title: '분석 시간이 너무 오래 걸렸습니다', hint: NOT_COUNTED },
  MODEL_TIMEOUT: MODEL_FAILURE,
  MODEL_FAILED: MODEL_FAILURE,
  MODEL_INVALID: MODEL_FAILURE,
  REPORT_MISSING: { title: '레포트를 불러오지 못했습니다', hint: '' },
};

export const STATUS_LABEL: Record<string, string> = {
  created: '업로드 미완료',
  queued: '대기 중',
  processing: '분석 중',
  done: '완료',
  failed: '실패',
};

export const STAGES = [
  { id: 'normalize', title: '영상 준비', doing: '영상을 준비하는 중', about: '재생용과 분석용 파일을 만듭니다.' },
  { id: 'scan', title: '객체 추적', doing: '차량과 사람을 추적하는 중', about: '차량과 사람을 프레임마다 따라갑니다.' },
  { id: 'locate', title: '충돌 후보 찾기', doing: '충돌 후보를 찾는 중', about: '급접근, 화면 흔들림, 소리 변화를 봅니다.' },
  { id: 'focus', title: '장면 고르기', doing: '볼 장면을 고르는 중', about: '후보 앞뒤에서 프레임을 뽑습니다.' },
  { id: 'observe', title: '장면 관찰', doing: '고른 장면을 읽는 중', about: 'AI가 프레임에서 보이는 사실만 적습니다.' },
  { id: 'assess', title: '기준과 대조', doing: '기준 도표와 대조하는 중', about: '확인한 사실을 과실 기준에 맞춰 봅니다.' },
];

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const faultRange = ({ my_min, my_max }: FaultAssessment) => (my_min === my_max ? `${my_min}%` : `${my_min}~${my_max}%`);

export const seoulDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

/** 목록 제목. 웹 AnalysisList와 같다. */
export function analysisTitle({ id, status, report, error }: Analysis): string {
  if (status === 'failed') return FAILURES[error?.code ?? '']?.title ?? '분석을 끝내지 못했습니다';
  if (!report) return `분석 #${id}`;
  if (report.involvement === 'none') return '사고 장면 미확인';
  return report.accident_type ?? '사고 분석 결과';
}

/**
 * 분석 하나를 3초마다 묻는다. 화면이 포커스일 때, 앱이 앞에 있을 때만 묻고
 * done/failed/created가 되거나 404가 오면 멈춘다. 404만 끝이고 나머지 오류는 잠깐일 수 있어 계속 묻는다.
 */
export function useAnalysis(id: string) {
  const api = useApi();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloads, setReloads] = useState(0);
  const stopRef = useRef(() => {});

  // 의존성은 id, api(안정된 함수), reloads뿐이다. 상태를 넣으면 effect가 다시 돌아 호출이 폭주한다.
  useFocusEffect(
    useCallback(() => {
      let stopped = false;
      let fetching = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const poll = async () => {
        clearTimeout(timer);
        if (stopped || fetching || AppState.currentState === 'background') return;
        fetching = true;
        try {
          const next = await api<Analysis>(`/api/v1/analyses/${id}`);
          if (stopped) return;
          setAnalysis(next);
          setStale(false);
          stopped = SETTLED.has(next.status);
        } catch (e) {
          if (stopped) return;
          if (e instanceof ApiFailure && e.status === 404) {
            setNotFound(e.message);
            stopped = true;
          } else {
            setStale(true);
          }
        } finally {
          fetching = false;
        }
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      };

      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') poll();
        else if (s === 'background') clearTimeout(timer);
      });
      stopRef.current = () => {
        stopped = true;
        clearTimeout(timer);
      };
      poll();
      return () => {
        stopped = true;
        clearTimeout(timer);
        sub.remove();
      };
    }, [id, api, reloads]),
  );

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  return { analysis, notFound, stale, stop: () => stopRef.current(), reload };
}
