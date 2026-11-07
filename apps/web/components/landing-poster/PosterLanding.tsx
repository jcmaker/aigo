import Link from "next/link";
import type { ReactNode } from "react";
import { SAMPLE_CLIP_SEC, SAMPLE_REPORT as report } from "@/components/landing/sample-report";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";
import { Reveal } from "@/components/ui/Reveal";
import { CountUp } from "./CountUp";
import { PosterMotion } from "./PosterMotion";
import { PosterProducts } from "./PosterProducts";
import "./poster.css";

const { fault, collision_t: collision } = report;
const step = fault.steps[0];

/** 위에서 내려다본 도로 그림. 사고 영상이나 프레임이 아니라 코드로 그린 도식이다. */
function RoadPlan() {
  return (
    <svg className="pl-plan" viewBox="0 0 300 280" role="img" aria-label="두 차량이 차로를 바꾸다 부딪히는 도식">
      <rect width="300" height="280" fill="#0d1596" />
      <path d="M150 0v280" stroke="#fff" strokeWidth="2.5" strokeDasharray="18 16" opacity=".75" />
      <path d="M44 0v280M256 0v280" stroke="#fff" strokeWidth="2.5" opacity=".35" />
      <path d="M206 276C206 190 196 140 122 104" fill="none" stroke="#ffe456" strokeWidth="2.5" strokeDasharray="5 6" />
      <rect x="74" y="128" width="44" height="80" fill="#fff" />
      <rect x="82" y="141" width="28" height="16" fill="#0d1596" />
      <rect x="132" y="40" width="44" height="78" fill="#ffe456" transform="rotate(24 154 79)" />
      <circle className="pl-plan-hit" cx="118" cy="120" r="20" fill="none" stroke="#ffe456" strokeWidth="3" />
      <circle cx="118" cy="120" r="5.5" fill="#ffe456" />
    </svg>
  );
}

function Phone() {
  return (
    <div className="pl-phone-wrap">
      <div className="pl-phone">
        <p className="pl-phone-top">
          <b>AIGO 분석</b>
          <span>예시</span>
        </p>
        <p className="pl-phone-title">{report.accident_type}</p>
        <RoadPlan />
        <div className="pl-phone-scrub" aria-hidden>
          <i style={{ left: `${(collision / SAMPLE_CLIP_SEC) * 100}%` }} />
        </div>
        <dl className="pl-phone-rows">
          <div>
            <dt>충돌</dt>
            <dd>{collision}초</dd>
          </div>
          <div>
            <dt>근거</dt>
            <dd>{step.t}초</dd>
          </div>
          <div>
            <dt>내 과실 범위</dt>
            <dd className="pl-phone-range">
              {fault.my_min}~{fault.my_max}%
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="hero" className="pl-hero">
      <span aria-hidden className="pl-orbit" />
      <span aria-hidden className="pl-orbit pl-orbit-2" />
      <h1 className="pl-title">
        <span>사고를</span> <span>읽다.</span>
      </h1>
      <Phone />
      <a href="#report" className="pl-sticker">
        레포트
        <br />
        예시 보기 ↓
      </a>
      <div className="pl-hero-bar">
        <p>블랙박스 영상을 올리면, 흐름과 근거를 정리합니다.</p>
        <div className="pl-actions">
          <Link href="/analyses/new" className="pl-btn pl-btn-yellow">
            사고 영상 분석하기
          </Link>
          <Link href="/#products" className="pl-btn pl-btn-line">
            DashPi 보기
          </Link>
        </div>
      </div>
    </section>
  );
}

function ImpactCard() {
  return (
    <>
      <p className="pl-card-big">
        <CountUp value={collision} decimals={1} />
        <small>초</small>
      </p>
      <div className="pl-rule" aria-hidden>
        <i style={{ left: `${(collision / SAMPLE_CLIP_SEC) * 100}%` }} />
      </div>
      <p className="pl-rule-ends">
        <span>0초</span>
        <span>{SAMPLE_CLIP_SEC}초</span>
      </p>
    </>
  );
}

function EvidenceCard() {
  return (
    <ol className="pl-times">
      {report.timeline.map((item) => (
        <li key={item.t} data-hit={item.t === collision || undefined}>
          <b>{item.t}초</b>
          <span>{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

function RangeCard() {
  return (
    <>
      <p className="pl-card-big">
        {fault.my_min}~{fault.my_max}
        <small>%</small>
      </p>
      <div className="pl-scale" aria-hidden>
        <i style={{ left: `${fault.my_min}%`, width: `${fault.my_max - fault.my_min}%` }} />
      </div>
      <p className="pl-rule-ends">
        <span>기본 {fault.base}%</span>
        <span>
          {step.label} −{Math.abs(step.delta)}%
        </span>
      </p>
    </>
  );
}

const CHAPTERS: { word: string; label: string; title: ReactNode; lead: string; card: ReactNode }[] = [
  {
    word: "IMPACT",
    label: "01 / 충돌 찾기",
    title: (
      <>
        충돌을 찾다.
        <br />
        <em>그 순간부터.</em>
      </>
    ),
    lead: "영상 전체를 훑어 부딪힌 장면을 먼저 짚습니다.",
    card: <ImpactCard />,
  },
  {
    word: "PROOF",
    label: "02 / 근거 시각",
    title: (
      <>
        근거는 시각으로.
        <br />
        <em>몇 초인지 남긴다.</em>
      </>
    ),
    lead: "무엇을 봤는지 영상 속 시각과 함께 적습니다.",
    card: <EvidenceCard />,
  },
  {
    word: "RANGE",
    label: "03 / 과실 범위",
    title: (
      <>
        과실은 범위로.
        <br />
        <em>단정하지 않는다.</em>
      </>
    ),
    lead: "기본 비율에서 무엇이 더하고 빠졌는지 보여 줍니다.",
    card: <RangeCard />,
  },
];

function Story() {
  return (
    <div id="story">
      {CHAPTERS.map((chapter) => (
        <section key={chapter.word} className="pl-chapter">
          <span aria-hidden className="pl-word">
            {chapter.word}
          </span>
          <div className="pl-chapter-grid">
            <div>
              <p className="pl-label">{chapter.label}</p>
              <h2 className="pl-chapter-title">{chapter.title}</h2>
              <p className="pl-lead">{chapter.lead}</p>
            </div>
            <div className="pl-card">
              <p className="pl-card-tag">예시</p>
              {chapter.card}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function Report() {
  return (
    <section id="report" aria-labelledby="report-title" className="pl-report">
      <p className="pl-kicker">
        <span>레포트 예시</span>
        <span>영상 없이 글만 싣습니다</span>
      </p>
      <div className="pl-report-grid">
        <div>
          <h2 id="report-title" className="pl-display">
            범위와
            <br />
            <em>이유를</em>
            <br />
            한 장에.
          </h2>
          <p className="pl-lead">{report.accident_type} 사고를 가정한 예시입니다.</p>
        </div>
        <Reveal>
          <article className="pl-sheet">
            <p className="pl-sheet-top">
              <b>내 과실 범위</b>
              <span>예시</span>
            </p>
            <p className="pl-sheet-number">
              <CountUp value={fault.my_min} />~<CountUp value={fault.my_max} />
              <small>%</small>
            </p>
            <dl className="pl-sheet-rows">
              <div>
                <dt>기준 {fault.chart_id}</dt>
                <dd>기본 {fault.base}%</dd>
              </div>
              <div>
                <dt>{step.label}</dt>
                <dd>−{Math.abs(step.delta)}%</dd>
              </div>
            </dl>
            <p className="pl-sheet-note">영상 기반 AI 추정이며 법적 판단이 아닙니다</p>
          </article>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section id="cta" aria-labelledby="cta-title" className="pl-cta">
      <h2 id="cta-title" className="pl-cta-title">
        올리고,
        <br />
        읽고,
        <br />
        <em>대비하기.</em>
      </h2>
      <div className="pl-cta-bar">
        <p>사고 뒤에 할 일을 영상 한 편에서 시작합니다.</p>
        <div className="pl-actions">
          <Link href="/analyses/new" className="pl-btn pl-btn-blue">
            사고 영상 분석하기
          </Link>
          <Link href="/#products" className="pl-btn pl-btn-ink">
            DashPi 보기
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PosterLanding() {
  return (
    <div data-surface="poster">
      <PosterMotion />
      <Nav />
      <main>
        <Hero />
        <Story />
        <Report />
        <PosterProducts />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
