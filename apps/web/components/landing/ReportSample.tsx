import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { formatTime } from "@/lib/format";
import { SAMPLE_REPORT as report } from "./sample-report";

function Stamp({ t }: { t: number }) {
  return <span className="font-mono text-[13px] font-medium text-accent-ink">{formatTime(t)}</span>;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-5 md:px-8 md:py-6">
      <h3 className="hud text-muted">{title}</h3>
      {children}
    </div>
  );
}

function Rows({ items }: { items: { t: number; text: string }[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.text} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline">
          <Stamp t={item.t} />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReportSample() {
  const { fault } = report;

  return (
    <section id="report" aria-labelledby="report-title">
      <SectionLabel index="02" aside="영상과 프레임 없이 글만 싣습니다">
        레포트 예시
      </SectionLabel>
      <Reveal>
        <div className="flex flex-col gap-4 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-10 md:py-16">
          <h2
            id="report-title"
            className="max-w-3xl text-3xl leading-tight font-extrabold tracking-[-0.03em] text-ink-strong md:text-5xl"
          >
            결론과 근거를 한 장에 담습니다
          </h2>
          <p className="flex shrink-0 gap-4">
            <Badge tone="accent">예시</Badge>
            <Badge>임시 문구, 실제 분석 결과 아님</Badge>
          </p>
        </div>

        <div className="cells border-t border-line lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-8 p-5 md:p-8">
            <div>
              <p className="hud text-muted">결론 / {report.accident_type}</p>
              <p className="mt-4 font-mono text-6xl leading-none font-semibold tracking-tighter text-ink-strong md:text-8xl">
                {fault.my_min}~{fault.my_max}
                <span className="text-3xl md:text-5xl">%</span>
              </p>
              <p className="mt-3 text-muted">내 예상 과실 범위. 숫자 하나로 단정하지 않습니다.</p>
            </div>

            <div aria-hidden className="relative h-10">
              <div className="absolute inset-x-0 top-3 h-2 border border-line-strong" />
              <div
                className="absolute top-3 h-2 bg-accent"
                style={{ left: `${fault.my_min}%`, width: `${fault.my_max - fault.my_min}%` }}
              />
              <span className="hud absolute top-6 left-0 text-muted">0</span>
              <span className="hud absolute top-6 right-0 text-muted">100</span>
              <span
                className="hud absolute top-6 -translate-x-1/2 text-accent-ink"
                style={{ left: `${(fault.my_min + fault.my_max) / 2}%` }}
              >
                내 과실
              </span>
            </div>

            <dl className="mt-auto border-t border-line">
              {[
                ["기준 도표", fault.chart_id],
                ["기본 과실", `${fault.base}%`],
                ["충돌 시각", formatTime(report.collision_t)],
                ["신뢰도", report.confidence],
                ["심각도", report.severity],
              ].map(([term, value]) => (
                <div key={term} className="flex justify-between gap-4 border-b border-line py-2">
                  <dt className="text-muted">{term}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="cells">
            <Block title="요약">
              <p className="text-lg leading-snug font-semibold text-ink-strong">{report.summary}</p>
            </Block>
            <Block title="타임라인">
              <Rows items={report.timeline} />
            </Block>
            <div className="cells md:grid-cols-2">
              <Block title="확인된 사실">
                <Rows items={report.facts} />
              </Block>
              <Block title="확인할 수 없는 사실">
                <ul className="flex flex-col gap-2">
                  {[...report.unseen, ...fault.unknown].map((item) => (
                    <li key={item} className="flex items-baseline justify-between gap-3">
                      <span>{item}</span>
                      <span className="hud shrink-0 text-muted">unknown</span>
                    </li>
                  ))}
                </ul>
              </Block>
            </div>
            <div className="cells md:grid-cols-2">
              <Block title="수정요소">
                {fault.steps.map((step) => (
                  <p key={step.label} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-x-0">
                    <Stamp t={step.t} />
                    <span>{step.label}</span>
                    <span className="pl-3 font-mono font-semibold">{String(step.delta).replace("-", "−")}</span>
                  </p>
                ))}
              </Block>
              <Block title="지금 할 일">
                <ol className="flex flex-col gap-2">
                  {report.actions_now.map((action, i) => (
                    <li key={action} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline">
                      <span className="font-mono text-[13px] text-muted">{i + 1}.</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ol>
              </Block>
            </div>
          </div>
        </div>

        <div className="border-t border-line p-5 md:px-8">
          <Notice>영상 기반 AI 추정이며 법적 판단이 아닙니다</Notice>
        </div>
      </Reveal>
    </section>
  );
}
