// TODO(T11): 아래 값은 임시 문구다. Task 11 평가에서 나온 실제 레포트 글로 SAMPLE_REPORT를 바꾸고,
// 그 영상 길이로 SAMPLE_CLIP_SEC를 바꾼 뒤 ReportSample의 "임시 문구" 표시를 지운다.
// 영상, 프레임, 번호판은 넣지 않는다. 키는 apps/api/app/report.py의 Report와 같다.
export const SAMPLE_CLIP_SEC = 12;

export const SAMPLE_REPORT = {
  accident_type: "후행 직진 대 선행 진로변경",
  summary: "앞서가던 차량이 오른쪽 차로에서 내 차로로 들어오다가 내 차 앞부분과 부딪혔습니다.",
  collision_t: 7.4,
  confidence: "보통",
  severity: "낮음",
  timeline: [
    { t: 3.2, text: "상대 차량이 오른쪽 차로 앞쪽에 보입니다." },
    { t: 6.1, text: "상대 차량이 방향지시등 없이 차로를 넘기 시작합니다." },
    { t: 7.4, text: "내 차 앞부분과 상대 차량 뒷부분이 부딪힙니다." },
  ],
  facts: [
    { t: 5.8, text: "두 차로 사이 경계선은 점선입니다." },
    { t: 6.1, text: "상대 차량 방향지시등이 켜지지 않았습니다." },
  ],
  unseen: ["도로 옆 표지 내용", "내 차의 정확한 속도"],
  fault: {
    chart_id: "차43-2",
    base: 30,
    my_min: 20,
    my_max: 30,
    steps: [{ label: "상대 진로변경 신호불이행", delta: -10, t: 6.1 }],
    unknown: ["내 차 전방주시 여부"],
  },
  actions_now: ["원본 영상을 따로 백업합니다.", "보험사에 사고를 접수합니다."],
};
