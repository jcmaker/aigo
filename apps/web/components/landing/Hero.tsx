import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { Marquee } from "@/components/ui/Marquee";
import { formatTime } from "@/lib/format";
import { SAMPLE_CLIP_SEC, SAMPLE_REPORT } from "./sample-report";

const LIMITS = [
  ["형식", "mp4, mov, webm, avi"],
  ["크기", "200MB까지"],
  ["길이", "2분까지"],
];

const LEGEND = [
  { n: 1, label: "상대 차량", note: "내 차로로 진입" },
  { n: 2, label: "차로 경계", note: "점선 구간" },
  { n: 3, label: "도로 표지", note: "확인 불가", unknown: true },
];

const STRIP = ["충돌 시각", "근거 시각", "과실 범위", "확인 불가 항목", "12대 중과실 점검", "대응 안내"];

const VANISH = { x: 400, y: 140 };
/** 소실점에서 화면 아래쪽까지의 비율 k로 도로 위 점을 잡는다. */
const onRoad = (bottomX: number, k: number) => ({
  x: VANISH.x + (bottomX - VANISH.x) * k,
  y: VANISH.y + 310 * k,
});

function Tag({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="34" height="34" className="scene-tag" />
      <text x="17" y="25" textAnchor="middle" className="scene-tag-text">
        {n}
      </text>
    </g>
  );
}

/** 뒤에서 본 상대 차량. 번호판은 빈칸이다. 기본 자세가 충돌 순간이고 애니메이션은 거기서 멀어졌다 돌아온다. */
function Car() {
  return (
    <g transform="translate(450 318)">
      <g className="scene-car">
        <path
          className="scene-fill"
          d="M-120 40-118-10Q-112-30-96-36L-74-80Q-68-90-54-90H54Q68-90 74-80L96-36Q112-30 118-10L120 40Q120 56 104 56H-104Q-120 56-120 40Z"
        />
        <path className="scene-thin" d="M-62-78H62L80-38H-80ZM-112-20H-72V-4H-112ZM72-20H112V-4H72ZM-30 12H30V32H-30ZM-118 36H118" />
        <path className="scene-thin" d="M-108 56V74H-74V56M74 56V74H108V56" />
        <rect x="-136" y="-104" width="272" height="192" className="scene-box" />
        <Tag x={-136} y={-138} n={1} />
      </g>
    </g>
  );
}

function Scene() {
  return (
    <svg viewBox="0 40 800 400" className="block w-full" role="img" aria-label="차로를 바꾸는 앞차와 번호 붙은 박스 세 개를 선으로 그린 예시 장면">
      <path className="scene-road" d={`M${VANISH.x} ${VANISH.y}L-120 450H920Z`} />
      <path className="scene-thin" d="M0 140H310L340 128 372 136 410 122 452 134 486 126 520 140H800" />
      <path className="scene-line" d={`M${VANISH.x} ${VANISH.y}L-120 450M${VANISH.x} ${VANISH.y}L920 450`} />
      <path className="scene-dash" d={`M${VANISH.x} ${VANISH.y}L230 450M${VANISH.x} ${VANISH.y}L570 450`} />
      {[0.24, 0.38, 0.6, 0.94].map((k) => {
        const left = onRoad(-190, k);
        const right = onRoad(990, k);
        return (
          <path
            key={k}
            className="scene-thin"
            d={`M${left.x} ${left.y}v${-70 * k}M${right.x} ${right.y}v${-70 * k}`}
          />
        );
      })}

      {/* 3: 읽을 수 없는 표지. 점선 박스는 unknown을 뜻한다. */}
      <path className="scene-line" d="M700 150V252" />
      <rect x="660" y="92" width="80" height="58" className="scene-fill" />
      <path className="scene-thin" d="M668 142 692 100M684 142 708 100M700 142 724 100M716 142 732 114" />
      <rect x="648" y="80" width="104" height="82" className="scene-box-unknown" />
      <Tag x={648} y={46} n={3} />

      {/* 2: 차로 경계 */}
      <rect x="226" y="286" width="96" height="122" className="scene-box-ink" />
      <Tag x={226} y={252} n={2} />

      <Car />

      {/* 충돌 표시 */}
      <g transform="translate(450 370)" className="scene-hit">
        <circle r="30" className="scene-hit-ring" />
        <circle r="6" className="scene-hit-dot" />
        <path className="scene-hit-ring" d="M0-46V-62M0 46V62M-46 0H-62M46 0H62" />
      </g>

      {/* 내 차 보닛 */}
      <path className="scene-hood" d="M90 450Q400 360 710 450Z" />
    </svg>
  );
}

function Timeline() {
  const pct = (t: number) => `${(t / SAMPLE_CLIP_SEC) * 100}%`;
  const collision = SAMPLE_REPORT.collision_t;

  return (
    <div role="group" className="px-5 pt-8 pb-3" aria-label="근거 시각 타임라인">
      <div className="scene-rail relative h-5" style={{ "--collision": pct(collision) } as React.CSSProperties}>
        {SAMPLE_REPORT.timeline.map(({ t }) => (
          <span
            key={t}
            style={{ left: pct(t) }}
            className={`hud absolute -top-6 -translate-x-1/2 ${t === collision ? "font-bold text-accent-ink" : "text-muted"}`}
          >
            {formatTime(t)}
          </span>
        ))}
        {SAMPLE_REPORT.timeline.map(({ t }) => (
          <span
            key={t}
            aria-hidden
            style={{ left: pct(t) }}
            className={`absolute top-0 h-full -translate-x-1/2 ${t === collision ? "w-1 bg-accent" : "w-px bg-ink"}`}
          />
        ))}
        <span aria-hidden className="scene-head" />
      </div>
      <p className="hud mt-2 flex justify-between text-muted">
        <span>0:00</span>
        <span>충돌 {formatTime(collision)}</span>
        <span>{formatTime(SAMPLE_CLIP_SEC)}</span>
      </p>
    </div>
  );
}

export function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title">
      <div className="hero-in px-5 pt-10 pb-8 md:px-10 md:pt-12 md:pb-10">
        <p className="hud text-muted normal-case">
          AIGO <span className="text-accent-ink">/</span> 사고 영상 분석과 DashPi 블랙박스
        </p>
        <h1
          id="hero-title"
          className="mt-5 text-[2.5rem] leading-[1.12] font-extrabold tracking-[-0.035em] text-ink-strong md:text-[4rem] lg:text-[5rem]"
        >
          <span className="block text-muted">
            사고를 <span className="hero-strike">판정</span>하는 AI가 아니라
          </span>
          <span className="block">
            사고 <span className="text-accent-ink">대응력</span>을 <br className="md:hidden" />
            높이는 AI
          </span>
        </h1>
      </div>

      <div className="cells border-t border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col justify-between gap-10 px-5 py-8 md:px-10 md:py-10">
          <div className="flex flex-col gap-7">
            <p className="max-w-md text-[17px] leading-relaxed text-muted">
              AIGO의 사고분석은 올린 영상에서 충돌 순간을 찾고, 보이는 사실과 근거 시각, 예상 과실 범위, 지금 할 일을 레포트로
              정리합니다. DashPi가 아닌 블랙박스 영상도 분석할 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link href="/analyses/new" className={buttonClass({ size: "lg" })}>
                사고 영상 분석하기
              </Link>
              <a href="#products" className={buttonClass({ variant: "secondary", size: "lg" })}>
                DashPi 보기
              </a>
            </div>
          </div>
          <dl className="border-t border-line">
            {LIMITS.map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4 border-b border-line py-2">
                <dt className="hud text-muted">{term}</dt>
                <dd className="font-mono text-[13px]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure data-scene className="flex min-w-0 flex-col bg-sunken!">
          <div className="relative overflow-hidden">
            <Scene />
            <figcaption className="hud absolute top-0 left-0 bg-invert-bg px-3 py-2 text-invert-fg">
              예시
            </figcaption>
          </div>
          <Timeline />
          <ol className="cells border-t border-line sm:grid-cols-3">
            {LEGEND.map((item) => (
              <li key={item.n} className="flex items-center gap-3 bg-sunken! px-5 py-2.5">
                <span
                  aria-hidden
                  className={`hud flex size-6 shrink-0 items-center justify-center ${
                    item.unknown
                      ? "border border-dashed border-line-strong"
                      : item.n === 1
                        ? "bg-accent text-white"
                        : "bg-invert-bg text-invert-fg"
                  }`}
                >
                  {item.n}
                </span>
                <span className="text-[13px] leading-tight">
                  <b className="font-semibold">{item.label}</b> <span className="text-muted">{item.note}</span>
                </span>
              </li>
            ))}
          </ol>
        </figure>
      </div>

      <Marquee items={STRIP} />
    </section>
  );
}
