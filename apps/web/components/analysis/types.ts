import type { components } from "@/lib/api.gen";

type Schemas = components["schemas"];
export type Analysis = Schemas["AnalysisOut"];
export type Report = Schemas["Report"];
export type Evidence = Schemas["Evidence"];
export type FaultAssessment = Schemas["FaultAssessment"];
export type SeriousViolation = Schemas["SeriousViolation"];
export type UploadTicket = Schemas["UploadTicket"];

export type OverlayBox = { id: number; cls: string; box: number[] }; // box: 0~1로 정규화한 [x1, y1, x2, y2]
export type OverlayFrame = { t: number; boxes: OverlayBox[] };
export type Overlay = { width: number; height: number; frames: OverlayFrame[] };

export type Seek = (t: number) => void;

/** 모델 출력이 아니라 화면 코드에 고정한다. */
export const DISCLAIMER = "영상 기반 AI 추정이며 법적 판단이 아닙니다";

export const LEVEL = { high: "높음", medium: "보통", low: "낮음" } as const;

const NEXT_DAY = "한국 시간 자정이 지나면 다시 올릴 수 있습니다.";
const NOT_COUNTED = "실패한 분석은 하루 한도에 세지 않습니다.";
const MODEL_FAILURE = { title: "AI 분석을 끝내지 못했습니다", hint: `영상 문제가 아닐 수 있습니다. ${NOT_COUNTED}` };

export const FAILURES: Record<string, { title: string; hint: string; final?: boolean }> = {
  DAILY_LIMIT: { title: "오늘 올릴 수 있는 분석을 모두 썼습니다", hint: NEXT_DAY, final: true },
  SERVICE_LIMIT: { title: "오늘 서비스 분석이 마감됐습니다", hint: NEXT_DAY, final: true },
  UPLOAD_FAILED: { title: "영상을 올리지 못했습니다", hint: "다시 시도해도 하루 한도를 더 쓰지 않습니다." },
  UPLOAD_INCOMPLETE: { title: "영상이 끝까지 올라가지 않았습니다", hint: "다시 시도하면 처음부터 올립니다." },
  INVALID_VIDEO: { title: "영상을 읽지 못했습니다", hint: "파일이 손상되지 않았는지 확인하고 다른 파일로 올려 주세요." },
  VIDEO_TOO_LONG: { title: "영상이 너무 깁니다", hint: "충돌 앞뒤만 남기고 2분 이하로 잘라서 올려 주세요." },
  UPLOAD_CHANGED: { title: "업로드한 영상이 바뀌었습니다", hint: "분석을 시작한 뒤 파일이 달라졌습니다. 영상을 새로 올려 주세요." },
  INTERNAL_ERROR: { title: "분석 중 문제가 생겼습니다", hint: `영상 문제가 아닐 수 있습니다. ${NOT_COUNTED}` },
  WORKER_TIMEOUT: { title: "분석 시간이 너무 오래 걸렸습니다", hint: NOT_COUNTED },
  MODEL_TIMEOUT: MODEL_FAILURE,
  MODEL_FAILED: MODEL_FAILURE,
  MODEL_INVALID: MODEL_FAILURE,
  REPORT_MISSING: { title: "레포트를 불러오지 못했습니다", hint: "" },
};
