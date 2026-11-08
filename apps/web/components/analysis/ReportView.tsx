"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import "@/styles/print.css";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { EvidenceLink } from "./EvidenceLink";
import { FaultBreakdown, FaultGauge, faultRange } from "./FaultBreakdown";
import { DISCLAIMER, LEVEL, type Analysis, type Evidence, type Report, type Seek } from "./types";
import { VideoOverlay } from "./VideoOverlay";
import { ViolationList } from "./ViolationList";
import { SourceBadge } from "./SourceBadge";

const NO_SCENE = "이 영상에서 사고 장면을 확인하지 못했습니다";
const SPLIT = "cells md:auto-cols-[minmax(0,1fr)] md:grid-flow-col"; // 항목이 하나만 있어도 빈 칸이 남지 않는다
const CONFIDENCE_MEANS = "과실 판단이 맞을 확률이 아니라, 영상에서 충돌 장면과 근거를 얼마나 확인했는지를 뜻합니다.";

function EvidenceRows({ items, active, onSeek }: { items: Evidence[]; active?: number; onSeek?: Seek }) {
  return (
    <ol className="-ml-3.5 flex flex-col">
      {items.map((e, i) => (
        <li
          key={`${e.t}-${e.text}`}
          aria-current={i === active || undefined}
          className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-3 border-l-2 border-transparent py-2.5 pl-3 transition-colors duration-[var(--dur-hover)] aria-current:border-accent aria-current:bg-raised print:break-inside-avoid"
        >
          <EvidenceLink t={e.t} onSeek={onSeek} />
          <span className="text-sm">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** 파이프라인이 문장 끝에 붙인 "(7.8초)"를 눌러서 이동하는 근거로 바꾼다. */
function Claims({ items, onSeek }: { items: string[]; onSeek?: Seek }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((claim) => {
        const m = claim.match(/^(.*?)\s*\((\d+(?:\.\d+)?)초\)$/);
        return (
          <li key={claim} className="flex items-baseline justify-between gap-3 print:break-inside-avoid">
            <span>{m ? m[1] : claim}</span>
            {m && <EvidenceLink t={Number(m[2])} onSeek={onSeek} />}
          </li>
        );
      })}
    </ul>
  );
}

function ClaimColumn({ title, items, onSeek }: { title: string; items: string[]; onSeek?: Seek }) {
  return (
    <div className="p-5 md:p-10">
      <h3 className="mb-3 text-xl font-bold tracking-[-0.02em] text-ink-strong">{title}</h3>
      <Claims items={items} onSeek={onSeek} />
    </div>
  );
}

function Steps({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="p-5 md:p-10">
      <h3 className="mb-3 text-xl font-bold tracking-[-0.02em] text-ink-strong">{title}</h3>
      <ol className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={item} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline print:break-inside-avoid">
            <span className="font-mono text-sm text-accent-ink">{i + 1}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 p-5 md:px-10">
      <dt className="hud text-muted">{label}</dt>
      <dd className="contents">{children}</dd>
    </div>
  );
}

function Verdict({ report }: { report: Report }) {
  const { fault } = report;

  return (
    <div className="flex flex-col justify-between gap-8 bg-invert-bg p-5 text-invert-fg md:p-10 in-[.cells]:bg-invert-bg">
      {fault ? (
        <>
          <div>
            <p className="hud">내 과실 예상</p>
            <p className="mt-2 font-mono text-6xl font-semibold tracking-[-0.04em] md:text-7xl">{faultRange(fault)}</p>
          </div>
          <FaultGauge fault={fault} />
        </>
      ) : (
        <div>
          <p className="hud">과실비율</p>
          <p className="mt-2 text-2xl leading-snug font-bold tracking-[-0.02em]">
            {report.involvement === "witness" ? "촬영 차가 당사자가 아니어서 과실비율을 내지 않습니다." : report.fault_note}
          </p>
        </div>
      )}
    </div>
  );
}

export function ReportView({ analysis, onReload }: { analysis: Analysis; onReload?: () => void }) {
  const report = analysis.report as Report;
  const none = report.involvement === "none";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(-1);
  const { timeline } = report;

  const seek = useCallback<Seek>((t) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = t;
    video.scrollIntoView({ block: "nearest" });
  }, []);
  const onSeek = analysis.playback_url ? seek : undefined;

  // 프레임마다 불리지만 값이 같으면 다시 그리지 않는다.
  const onTime = useCallback(
    (t: number) => setActive(timeline.findLastIndex((e) => e.t <= t + 0.05)),
    [timeline],
  );

  const size = analysis.progress.find((p) => p.stage === "normalize")?.detail as { width?: number; height?: number } | null | undefined;
  const video = analysis.playback_url ? (
    <VideoOverlay
      key={analysis.playback_url}
      src={analysis.playback_url}
      overlayUrl={analysis.overlay_url}
      videoRef={videoRef}
      width={size?.width}
      height={size?.height}
      onTime={onTime}
      onReload={onReload}
    />
  ) : (
    <p className="text-sm text-muted print:hidden">재생할 수 있는 영상이 없습니다.</p>
  );

  const printHead = (
    <p className="hud hidden px-5 pb-3 print:block">
      AIGO 사고 분석 레포트 · 분석 #{analysis.id} · {new Date(analysis.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
    </p>
  );
  const disclaimer = (
    <div className="px-5 pb-5 md:px-10">
      <Notice label="주의">{DISCLAIMER}</Notice>
    </div>
  );

  if (none) {
    return (
      <article>
        {printHead}
        {disclaimer}
        <header className="flex flex-col gap-3 border-t border-line p-5 md:p-10">
          <SourceBadge source={analysis.source} />
          <h1 className="max-w-4xl text-3xl leading-tight font-bold tracking-[-0.02em] text-ink-strong md:text-5xl">{NO_SCENE}</h1>
          <p className="max-w-3xl text-lg">{report.reason}</p>
          <p className="max-w-3xl text-muted">분석이 실제 충돌을 놓쳤을 수 있습니다. 아래 영상을 직접 확인해 주세요.</p>
        </header>
        <div className="border-t border-line p-5 md:p-10 print:hidden">{video}</div>
      </article>
    );
  }

  const others = report.facts.filter((f) => !timeline.some((e) => e.t === f.t && e.text === f.text));
  const sections: [string, ReactNode][] = [];
  sections.push([
    "영상과 타임라인",
    <div key="v" className="cells lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="p-5 md:p-10 print:hidden">
        <div className="lg:sticky lg:top-28">{video}</div>
      </div>
      <div className="flex flex-col gap-6 p-5 md:p-10">
        <div>
          <h3 className="mb-2 text-xl font-bold tracking-[-0.02em] text-ink-strong">타임라인</h3>
          <EvidenceRows items={timeline} active={active} onSeek={onSeek} />
        </div>
        {others.length > 0 && (
          <div>
            <h3 className="hud mb-1 text-muted">그 밖에 확인된 사실</h3>
            <EvidenceRows items={others} onSeek={onSeek} />
          </div>
        )}
      </div>
    </div>,
  ]);
  if (report.fault) sections.push(["과실 근거", <FaultBreakdown key="f" fault={report.fault} onSeek={onSeek} />]);
  if (report.favorable.length || report.unfavorable.length) {
    sections.push([
      "유리한 점과 불리한 점",
      <div key="c" className={SPLIT}>
        {report.favorable.length > 0 && <ClaimColumn title="유리한 점" items={report.favorable} onSeek={onSeek} />}
        {report.unfavorable.length > 0 && <ClaimColumn title="불리한 점" items={report.unfavorable} onSeek={onSeek} />}
      </div>,
    ]);
  }
  if (report.serious_violations.length) {
    sections.push(["12대 중과실", <ViolationList key="s" items={report.serious_violations} onSeek={onSeek} />]);
  }
  if (report.unseen.length) {
    sections.push([
      "확인할 수 없는 사실",
      <ul key="u" className="flex flex-col gap-2 p-5 md:px-10">
        {report.unseen.map((u) => (
          <li key={u}>{u}</li>
        ))}
      </ul>,
    ]);
  }
  if (report.actions_now.length || report.actions_later.length) {
    sections.push([
      "지금 할 일과 이후 대응",
      <div key="a" className={SPLIT}>
        {report.actions_now.length > 0 && <Steps title="지금 할 일" items={report.actions_now} />}
        {report.actions_later.length > 0 && <Steps title="이후 대응" items={report.actions_later} />}
      </div>,
    ]);
  }

  return (
    <article>
      {printHead}
      {disclaimer}
      <section>
        <SectionLabel index="01">결론</SectionLabel>
        <div className="cells lg:grid-cols-[minmax(0,1fr)_28rem]">
          <header className="flex flex-col gap-4 p-5 md:p-10">
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-3">
                <Badge tone="accent">{report.involvement === "party" ? "내 차 사고" : "제3자 사고"}</Badge>
                <SourceBadge source={analysis.source} />
              </span>
              <Button size="sm" variant="secondary" className="print:hidden" onClick={() => window.print()}>
                PDF로 저장
              </Button>
            </div>
            <h1 className="text-3xl leading-tight font-bold tracking-[-0.02em] text-ink-strong md:text-5xl">
              {report.accident_type ?? "사고 분석 결과"}
            </h1>
            {report.summary && <p className="max-w-3xl text-lg leading-relaxed">{report.summary}</p>}
          </header>
          <Verdict report={report} />
        </div>
        <dl className="cells border-t border-line sm:auto-cols-[minmax(0,1fr)] sm:grid-flow-col">
          <Stat label="신뢰도">
            <p className="text-xl font-bold text-ink-strong">{LEVEL[report.confidence]}</p>
            <p className="text-sm text-muted">{CONFIDENCE_MEANS}</p>
          </Stat>
          {report.severity && (
            <Stat label="심각도">
              <p className={`text-xl font-bold ${report.severity === "high" ? "text-danger" : "text-ink-strong"}`}>{LEVEL[report.severity]}</p>
            </Stat>
          )}
          {report.collision_t !== null && (
            <Stat label="충돌 시각">
              <span className="[&>*]:text-xl">
                <EvidenceLink t={report.collision_t} onSeek={onSeek} />
              </span>
            </Stat>
          )}
        </dl>
      </section>

      {sections.map(([title, body], i) => (
        <section key={title}>
          <SectionLabel index={String(i + 2).padStart(2, "0")}>{title}</SectionLabel>
          {body}
        </section>
      ))}
    </article>
  );
}
