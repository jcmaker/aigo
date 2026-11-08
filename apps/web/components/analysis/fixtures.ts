import type { Analysis, Overlay, Report } from "./types";

// 테스트와 개발 전용 미리보기가 함께 쓰는 예시 데이터다. 실제 분석 결과가 아니다.
const FACTS = [
  { t: 3.2, text: "내 차가 편도 2차로의 2차로를 직진하고 있습니다." },
  { t: 7.8, text: "오른쪽 골목에서 흰색 승용차가 나타납니다." },
  { t: 9.4, text: "흰색 승용차가 내 차의 앞쪽 범퍼와 부딪힙니다." },
  { t: 11.6, text: "두 차가 교차로 안에 멈춥니다." },
];

export const PARTY: Report = {
  involvement: "party",
  reason: null,
  accident_type: "신호 없는 교차로 직진 대 우측 진입 충돌",
  summary:
    "내 차가 신호 없는 교차로를 직진하던 중 오른쪽 골목에서 나온 승용차와 부딪혔습니다. 충돌 직전 상대 차는 일시정지 없이 교차로로 들어왔습니다.",
  collision_t: 9.4,
  confidence: "high",
  severity: "medium",
  timeline: FACTS,
  facts: [...FACTS, { t: 8.6, text: "교차로 진입 전 내 차의 제동등은 보이지 않습니다." }],
  unseen: ["내 차의 실제 속도", "상대 운전자의 음주 여부", "교차로 좌측 시야"],
  fault: {
    chart_id: "cross-42",
    chart_title: "신호 없는 교차로, 직진 대 우측 도로 진입",
    source_url: "https://accident.knia.or.kr/",
    me: "A",
    base: 40,
    my_min: 20,
    my_max: 40,
    steps: [
      { label: "상대 일시정지 없이 진입", delta: -10, evidence: FACTS[1] },
      { label: "상대 교차로 내 진로 방해", delta: -10, evidence: FACTS[2] },
    ],
    unknown: ["내 제한속도 초과 여부"],
    laws: [{ name: "도로교통법", article: "제19조", title: "안전거리 확보 등", url: "https://www.law.go.kr/법령/도로교통법/제19조" }],
    cases: [{ court: "대법원", date: "1986.12.9.", number: "86다카1551", url: "https://www.law.go.kr/판례/(86다카1551)" }],
  },
  fault_note: null,
  serious_violations: [
    { item: "신호위반", likelihood: "low", evidence: FACTS[1], party: "unknown" },
    { item: "음주운전", likelihood: "unknown", evidence: null, party: "unknown" },
    { item: "제한속도 20km/h 초과", likelihood: "unknown", evidence: null, party: "unknown" },
  ],
  favorable: ["상대 차가 일시정지 없이 교차로에 들어왔습니다 (7.8초)", "내 차가 먼저 교차로에 들어와 있었습니다 (8.6초)"],
  unfavorable: ["충돌 전 내 차의 감속이 보이지 않습니다 (8.6초)"],
  actions_now: ["다친 사람이 있는지 확인하고 필요하면 119에 연락합니다.", "2차 사고를 막도록 비상등을 켜고 안전한 곳으로 이동합니다.", "보험사에 사고를 접수하고 이 영상 원본을 보관합니다."],
  actions_later: ["상대 보험사가 제시한 과실비율과 근거를 서면으로 받습니다.", "합의가 어려우면 과실비율 분쟁심의를 신청할 수 있습니다."],
};

export const NO_CHART: Report = {
  ...PARTY,
  accident_type: "주차장 내 후진 접촉",
  confidence: "medium",
  severity: null,
  fault: null,
  fault_note: "기준 도표를 찾지 못했습니다.",
};

export const WITNESS: Report = {
  ...PARTY,
  involvement: "witness",
  accident_type: "앞차들 사이의 추돌",
  summary: "내 차 앞쪽 1차로에서 두 차가 추돌했습니다. 내 차는 충돌에 관여하지 않았습니다.",
  confidence: "medium",
  severity: "low",
  fault: null,
  fault_note: null,
  serious_violations: [],
  favorable: [],
  unfavorable: [],
  actions_now: ["목격한 시각과 위치를 기록합니다.", "경찰이나 당사자가 요청하면 영상을 제공할 수 있습니다."],
  actions_later: [],
};

export const NONE: Report = {
  involvement: "none",
  reason: "주행 장면만 보이고 프레임에서 충돌 순간을 찾지 못했습니다.",
  accident_type: null,
  summary: null,
  collision_t: null,
  confidence: "low",
  severity: null,
  timeline: [],
  facts: [],
  unseen: [],
  fault: null,
  fault_note: null,
  serious_violations: [],
  favorable: [],
  unfavorable: [],
  actions_now: [],
  actions_later: [],
};

const at = (s: number) => `2026-11-05T05:12:${String(s).padStart(2, "0")}Z`;
const STAGES: Analysis["progress"] = [
  { stage: "normalize", status: "done", detail: { duration: 18.4, width: 1920, height: 1080 }, at: at(6) },
  { stage: "scan", status: "done", detail: { frames: 92, tracks: 14 }, at: at(19) },
  { stage: "locate", status: "done", detail: { candidates: [9.4, 12.2] }, at: at(20) },
  { stage: "focus", status: "done", detail: { frames: 10, times: [3.2, 6.4, 7.8, 8.6, 9, 9.4, 9.8, 11.6, 12.2, 15] }, at: at(22) },
  { stage: "observe", status: "done", detail: { frames: 10, extra_focus: false }, at: at(41) },
  { stage: "assess", status: "done", detail: { involvement: "party", confidence: "high" }, at: at(52) },
];

export const analysis = (over: Partial<Analysis> = {}): Analysis => ({
  id: 12,
  source: "upload",
  status: "processing",
  stage: null,
  progress: [],
  report: null,
  playback_url: null,
  overlay_url: null,
  error: null,
  created_at: "2026-11-05T05:12:00Z",
  ...over,
});

export const running = (done: number): Analysis =>
  analysis({
    stage: STAGES[done].stage,
    progress: [...STAGES.slice(0, done), { ...STAGES[done], status: "running", detail: null }],
  });

export const finished = (report: Report): Analysis =>
  analysis({
    status: "done",
    stage: "assess",
    progress: STAGES,
    report,
    playback_url: "https://fixture.invalid/clip.webm",
    overlay_url: "https://fixture.invalid/overlay.json",
  });

export const failed = (code: string, message: string, done = 0): Analysis =>
  analysis({ ...running(done), status: "failed", error: { code, message } });

export const OVERLAY: Overlay = {
  width: 1920,
  height: 1080,
  frames: Array.from({ length: 92 }, (_, i) => {
    const grow = i / 92;
    return {
      t: i / 5,
      boxes: [
        { id: 1, cls: "car", box: [0.62 - 0.2 * grow, 0.42, 0.74, 0.5 + 0.25 * grow] },
        { id: 2, cls: "truck", box: [0.12, 0.38, 0.26, 0.56] },
      ],
    };
  }),
};
