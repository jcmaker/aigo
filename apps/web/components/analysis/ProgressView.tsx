import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { formatTime } from "@/lib/format";
import { FailureNotice } from "./FailureNotice";
import type { Analysis } from "./types";
import { SourceBadge } from "./SourceBadge";

type Detail = {
  duration?: number;
  width?: number;
  height?: number;
  frames?: number;
  tracks?: number;
  candidates?: number[];
  times?: number[];
  extra_focus?: boolean;
};

const STAGES = [
  { id: "normalize", title: "영상 준비", doing: "영상을 준비하는 중", about: "재생용과 분석용 파일을 만듭니다." },
  { id: "scan", title: "객체 추적", doing: "차량과 사람을 추적하는 중", about: "차량과 사람을 프레임마다 따라갑니다." },
  { id: "locate", title: "충돌 후보 찾기", doing: "충돌 후보를 찾는 중", about: "급접근, 화면 흔들림, 소리 변화를 봅니다." },
  { id: "focus", title: "장면 고르기", doing: "볼 장면을 고르는 중", about: "후보 앞뒤에서 프레임을 뽑습니다." },
  { id: "observe", title: "장면 관찰", doing: "고른 장면을 읽는 중", about: "AI가 프레임에서 보이는 사실만 적습니다." },
  { id: "assess", title: "기준과 대조", doing: "기준 도표와 대조하는 중", about: "확인한 사실을 과실 기준에 맞춰 봅니다." },
];

// ko-KR은 "14시 12분 6초"로 나와 고정폭 표지에 맞지 않는다.
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul" });
const times = (ts: number[]) => ts.map(formatTime).join(", ");

function result(id: string, d: Detail) {
  switch (id) {
    case "normalize":
      return `길이 ${formatTime(d.duration ?? 0)} · ${d.width}×${d.height}`;
    case "scan":
      return `프레임 ${d.frames}장 · 객체 ${d.tracks}개`;
    case "locate":
      return d.candidates?.length ? `후보 ${d.candidates.length}곳: ${times(d.candidates)}` : "뚜렷한 후보가 없어 고르게 살펴봅니다";
    case "focus":
      return `프레임 ${d.frames}장 선택`;
    case "observe":
      return `프레임 ${d.frames}장 확인${d.extra_focus ? " · 충돌 주변을 다시 봤습니다" : ""}`;
    default:
      return null;
  }
}

function TimeRail({ duration, candidates, frames }: { duration?: number; candidates: number[]; frames: number[] }) {
  const left = (t: number) => ({ left: `${Math.min(t / (duration ?? 1), 1) * 100}%` });

  return (
    <section className="bg-invert-bg px-5 py-6 text-invert-fg md:px-10 md:py-8">
      <h2 className="hud">영상에서 찾은 시각</h2>
      <div className="relative mt-4 h-20 border-b border-current">
        {duration &&
          frames.map((t) => <span key={t} data-reveal="in" className="absolute bottom-0 h-4 w-px bg-current" style={left(t)} />)}
        {duration &&
          candidates.map((t) => <span key={t} data-reveal="in" className="absolute bottom-0 h-full w-1 -translate-x-1/2 bg-accent" style={left(t)} />)}
      </div>
      <div className="hud mt-2 flex justify-between">
        <span>0:00</span>
        <span>{duration ? formatTime(duration) : "길이 확인 중"}</span>
      </div>
      <dl className="hud mt-5 flex flex-wrap gap-x-6 gap-y-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-1 bg-accent" />
          <dt>충돌 후보</dt>
          <dd>{candidates.length}곳</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-px bg-current" />
          <dt>고른 프레임</dt>
          <dd>{frames.length}장</dd>
        </div>
      </dl>
    </section>
  );
}

export function ProgressView({ analysis, stale }: { analysis: Analysis; stale?: boolean }) {
  const failed = analysis.status === "failed";
  const abandoned = analysis.status === "created";
  const byStage = new Map(analysis.progress.map((p) => [p.stage, p]));
  const detail = (id: string) => (byStage.get(id)?.detail ?? {}) as Detail;
  const current = STAGES.findIndex((s) => s.id === analysis.stage);
  const headline = failed
    ? "분석을 끝내지 못했습니다"
    : abandoned
      ? "영상이 끝까지 올라가지 않았습니다"
      : (STAGES[current]?.doing ?? "분석 순서를 기다리는 중");

  return (
    <div>
      <header className="flex flex-col gap-3 p-5 md:p-10">
        <div aria-live="polite" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="hud text-muted">
              {failed || abandoned ? "분석 중단" : current >= 0 ? `단계 ${current + 1}/${STAGES.length}` : "대기열"}
            </p>
            <SourceBadge source={analysis.source} />
          </div>
          <h1 className="text-3xl leading-tight font-bold tracking-[-0.02em] text-ink-strong md:text-5xl">{headline}</h1>
        </div>
        {!failed && !abandoned && (
          <p className="text-muted">화면을 닫아도 분석은 계속됩니다. 끝나면 내 분석에서 레포트를 볼 수 있습니다.</p>
        )}
      </header>

      {(failed || abandoned || stale) && (
        <div className="flex flex-col items-start gap-4 px-5 pb-5 md:px-10 md:pb-10">
          {failed && analysis.error && <FailureNotice code={analysis.error.code} message={analysis.error.message} />}
          {abandoned && <Notice>이 분석은 시작되지 않았습니다. 영상을 다시 올려 주세요.</Notice>}
          {stale && <Notice>연결이 불안정합니다. 계속 다시 확인하고 있습니다.</Notice>}
          {(failed || abandoned) && (
            <Link href="/analyses/new" className={buttonClass()}>
              영상 다시 올리기
            </Link>
          )}
        </div>
      )}

      {!abandoned && (
        <>
          <TimeRail duration={detail("normalize").duration} candidates={detail("locate").candidates ?? []} frames={detail("focus").times ?? []} />
          <ol className="cells border-t border-line sm:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((s, i) => {
              const p = byStage.get(s.id);
              const done = p?.status === "done";
              const line = done ? result(s.id, detail(s.id)) : null;
              return (
                <li
                  key={s.id}
                  className={!p ? "[&_article]:opacity-55" : !done && !failed ? "[&_article]:bg-raised [&_article]:shadow-[inset_0_3px_0_var(--accent)]" : ""}
                >
                  <Card
                    index={`${String(i + 1).padStart(2, "0")}${done && p.at ? ` · ${clock(p.at)}` : ""}`}
                    title={s.title}
                    badge={
                      done ? (
                        <Badge tone="ok">완료</Badge>
                      ) : !p ? (
                        <Badge>대기</Badge>
                      ) : failed ? (
                        <Badge tone="danger">중단</Badge>
                      ) : (
                        <span className="animate-pulse motion-reduce:animate-none">
                          <Badge tone="accent">진행 중</Badge>
                        </span>
                      )
                    }
                  >
                    <p className="text-sm">{s.about}</p>
                    {line && (
                      <p data-reveal="in" className="mt-3 font-mono text-[13px] font-medium text-ink">
                        {line}
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
