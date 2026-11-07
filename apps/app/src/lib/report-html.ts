import { DISCLAIMER, LEVEL, LIKELIHOOD, faultRange, formatTime, seoulDate, signed, type Evidence, type Report } from './analysis';

// LLM이 만든 문자열도 모두 거친다. 따옴표까지 바꿔 속성에 들어가도 안전하다.
const esc = (v: string | number) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const h = (title: string, body: string) => (body ? `<h2>${esc(title)}</h2>${body}` : '');
const list = (items: string[], tag = 'ul') => (items.length ? `<${tag}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>` : '');
const rows = (items: Evidence[]) => (items.length ? `<ul>${items.map((e) => `<li>${esc(formatTime(e.t))} ${esc(e.text)}</li>`).join('')}</ul>` : '');

/** 화면 ReportView와 같은 항목을 글로만 만든다. 영상과 이미지는 넣지 않는다. */
export function reportHtml(report: Report, createdAt: string): string {
  const { fault } = report;
  const head = `<p class="notice">주의: ${esc(DISCLAIMER)}</p><p class="muted">${esc(seoulDate(createdAt))}</p>`;
  let body: string;

  if (report.involvement === 'none') {
    body = `<h1>사고 장면 미확인</h1>${report.reason ? `<p>${esc(report.reason)}</p>` : ''}<p class="muted">분석이 실제 충돌을 놓쳤을 수 있습니다. 영상을 직접 확인해 주세요.</p>`;
  } else {
    const verdict =
      `<p class="muted">${report.involvement === 'party' ? '내 차 사고' : '제3자 사고'}</p>` +
      `<h1>${esc(report.accident_type ?? '사고 분석 결과')}</h1>` +
      (report.summary ? `<p>${esc(report.summary)}</p>` : '') +
      (fault
        ? `<p>내 과실 예상 <b>${esc(faultRange(fault))}</b> (기본 ${esc(fault.base)})</p>`
        : `<p>과실비율: ${esc(report.involvement === 'witness' ? '촬영 차가 당사자가 아니어서 과실비율을 내지 않습니다.' : (report.fault_note ?? ''))}</p>`) +
      `<p>신뢰도 ${esc(LEVEL[report.confidence])}<br><span class="muted">과실 판단이 맞을 확률이 아니라, 영상에서 충돌 장면과 근거를 얼마나 확인했는지를 뜻합니다.</span></p>` +
      (report.severity ? `<p>심각도 ${esc(LEVEL[report.severity])}</p>` : '') +
      (report.collision_t !== null ? `<p>충돌 시각 ${esc(formatTime(report.collision_t))}</p>` : '');

    const others = report.facts.filter((f) => !report.timeline.some((e) => e.t === f.t && e.text === f.text));
    const faultBody = fault
      ? `<p>기준 도표: ${esc(fault.chart_title)} (내 차는 ${esc(fault.me)})</p><p class="muted">출처: 과실비율정보포털 ${esc(fault.source_url)}</p>` +
        `<table><tr><td>기본과실</td><td>${esc(fault.base)}</td></tr>` +
        fault.steps.map((s) => `<tr><td>${esc(s.label)}<br><span class="muted">${esc(formatTime(s.evidence.t))} ${esc(s.evidence.text)}</span></td><td>${esc(signed(s.delta))}</td></tr>`).join('') +
        `<tr><td><b>내 과실 예상</b></td><td><b>${esc(faultRange(fault))}</b></td></tr></table>` +
        (fault.unknown.length ? `<p>영상으로 판단하지 못한 요소 (예상 범위가 넓어질 수 있습니다)</p>${list(fault.unknown)}` : '')
      : '';
    const violations = report.serious_violations.length
      ? `<ul>${report.serious_violations
          .map((v) => `<li>${esc(v.item)} · ${esc(LIKELIHOOD[v.likelihood])}${v.evidence ? `<br><span class="muted">${esc(formatTime(v.evidence.t))} ${esc(v.evidence.text)}</span>` : ''}</li>`)
          .join('')}</ul>`
      : '';

    body =
      h('결론', verdict) +
      h('타임라인', rows(report.timeline)) +
      h('그 밖에 확인된 사실', rows(others)) +
      h('과실 근거', faultBody) +
      h('유리한 점', list(report.favorable)) +
      h('불리한 점', list(report.unfavorable)) +
      h('12대 중과실', violations) +
      h('확인할 수 없는 사실', list(report.unseen)) +
      h('지금 할 일', list(report.actions_now, 'ol')) +
      h('이후 대응', list(report.actions_later, 'ol'));
  }

  return (
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>` +
    `body{font-family:sans-serif;font-size:13px;line-height:1.5;padding:8px}h1{font-size:22px}h2{font-size:16px;margin-top:20px}` +
    `.notice{font-weight:700}.muted{color:#666}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top}td+td{text-align:right}` +
    `</style></head><body>${head}${body}</body></html>`
  );
}
