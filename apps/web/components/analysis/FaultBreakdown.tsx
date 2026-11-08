import { EvidenceLink } from "./EvidenceLink";
import type { FaultAssessment, Seek } from "./types";

export const faultRange = ({ my_min, my_max }: FaultAssessment) => (my_min === my_max ? `${my_min}%` : `${my_min}~${my_max}%`);

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** 0~100 눈금 위에 범위와 기본과실을 놓는다. 범위는 서버 값이다(수정요소 합으로 다시 계산하지 않는다). */
export function FaultGauge({ fault }: { fault: FaultAssessment }) {
  const { base, my_min, my_max } = fault;

  return (
    <div role="img" aria-label={`내 과실 ${my_min}에서 ${my_max}퍼센트, 기본과실 ${base}퍼센트`}>
      <div className="relative h-5">
        <span className="absolute inset-x-0 top-1/2 h-px bg-current opacity-40" />
        <span
          className="absolute top-1/2 h-2 min-w-1 -translate-y-1/2 bg-accent"
          style={{ left: `${my_min}%`, width: `${my_max - my_min}%` }}
        />
        <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-current" style={{ left: `${base}%` }} />
      </div>
      <div aria-hidden className="hud mt-1 flex justify-between opacity-80">
        <span>0</span>
        <span>기본 {base}</span>
        <span>100</span>
      </div>
    </div>
  );
}

const ROW = "grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-baseline gap-3 py-3";

const LINK = "font-semibold text-accent-ink underline underline-offset-4";

// 판례 url이 법제처 판례가 아니면 도표 출처 페이지다. 판례 항목은 글로만 두고 출처 링크를 목록 아래 하나만 둔다.
const CASE_URL = /^https:\/\/(www\.)?law\.go\.kr\/판례\//i;

function RefList({ title, items, source }: { title: string; items: { text: string; url: string }[]; source?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="hud text-muted">{title}</h3>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((i, n) => (
          <li key={`${n}:${i.url}`}>
            {/^https?:\/\//i.test(i.url) ? (
              <a href={i.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                {i.text}
              </a>
            ) : (
              <span className="font-semibold">{i.text}</span>
            )}
          </li>
        ))}
      </ul>
      {source && /^https?:\/\//i.test(source) && (
        <a href={source} target="_blank" rel="noopener noreferrer" className={`mt-2 inline-block text-sm ${LINK}`}>
          출처: 과실비율정보포털
        </a>
      )}
    </div>
  );
}

export function FaultBreakdown({ fault, onSeek }: { fault: FaultAssessment; onSeek?: Seek }) {
  return (
    <div className="cells lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="p-5 md:p-10">
        <div className="hud grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] gap-3 border-b border-line-strong pb-2 text-muted">
          <span>항목</span>
          <span>근거</span>
          <span className="text-right">내 과실</span>
        </div>
        <ul className="divide-y divide-line">
          <li className={ROW}>
            <span className="font-semibold">기본과실</span>
            <span />
            <span className="text-right font-mono font-semibold">{fault.base}</span>
          </li>
          {fault.steps.map((s) => (
            <li key={s.label} className={ROW}>
              <span>
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-sm text-muted">{s.evidence.text}</span>
              </span>
              <EvidenceLink t={s.evidence.t} onSeek={onSeek} />
              <span className="text-right font-mono font-semibold">{signed(s.delta)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-3 border-t border-line-strong pt-3">
          <span className="font-bold text-ink-strong">내 과실 예상</span>
          <span className="font-mono text-xl font-bold text-ink-strong">{faultRange(fault)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5 md:p-10">
        <div>
          <h3 className="hud text-muted">기준 도표</h3>
          <p className="mt-1 font-semibold">{fault.chart_title}</p>
          <p className="mt-1 text-sm text-muted">이 도표에서 내 차는 {fault.me}입니다.</p>
          <a href={fault.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-accent-ink underline underline-offset-4">
            출처: 과실비율정보포털
          </a>
        </div>
        <RefList title="관련 법규" items={(fault.laws ?? []).map((l) => ({ text: `${l.name} ${l.article}(${l.title})`, url: l.url }))} />
        <RefList
          title="참고 판례"
          items={(fault.cases ?? []).map((c) => ({ text: `${c.court} ${c.date} ${c.number}`, url: CASE_URL.test(c.url) ? c.url : "" }))}
          source={(fault.cases ?? []).find((c) => !CASE_URL.test(c.url))?.url}
        />
        {fault.unknown.length > 0 && (
          <div>
            <h3 className="hud text-muted">영상으로 판단하지 못한 요소</h3>
            <p className="mt-1 text-sm text-muted">이 요소 때문에 예상 범위가 넓어질 수 있습니다.</p>
            <ul className="mt-2 flex flex-col gap-1">
              {fault.unknown.map((u) => (
                <li key={u} className="font-semibold">
                  {u}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
