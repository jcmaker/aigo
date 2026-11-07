import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const GLYPH = "h-24 w-full border border-line bg-sunken text-ink";

const STEPS: { title: string; badge: string; text: string; glyph: ReactNode }[] = [
  {
    title: "영상을 올립니다",
    badge: "입력",
    text: "분석에 쓰도록 영상을 같은 형식으로 맞추고, 실제 영상인지와 길이를 먼저 확인합니다.",
    glyph: (
      <>
        <path d="M60 20H180V76H60ZM60 32H180M60 64H180" />
        <path d="M72 20V32M92 20V32M112 20V32M132 20V32M152 20V32M172 20V32M72 64V76M92 64V76M112 64V76M132 64V76M152 64V76M172 64V76" />
        <path className="stroke-accent" d="M120 58V38M111 46 120 37 129 46" strokeWidth="2" />
      </>
    ),
  },
  {
    title: "충돌 순간을 찾습니다",
    badge: "탐지",
    text: "전체를 훑어 박스 급팽창, 화면 흔들림, 소리 급상승을 찾고, 후보 구간만 촘촘히 다시 봅니다.",
    glyph: (
      <>
        <path d="M24 66H90L102 58 112 66H130L140 62 150 20 160 72 170 60 180 66H216" />
        <path d="M24 80H216" />
        <path className="stroke-accent" d="M150 12V88" strokeWidth="2" />
      </>
    ),
  },
  {
    title: "보이는 사실만 적습니다",
    badge: "관찰",
    text: "대표 프레임에서 보이는 것만 시각과 함께 적습니다. 판단은 이 관찰이 끝난 뒤에 합니다.",
    glyph: (
      <>
        <path d="M40 14H200V82H40Z" />
        <path className="stroke-accent" d="M70 34H128V70H70Z" strokeWidth="2" />
        <path d="M150 28H186V60H150Z" strokeDasharray="4 4" />
      </>
    ),
  },
  {
    title: "기준 표로 평가합니다",
    badge: "계산",
    text: "모델은 기준 도표와 수정요소를 고르기만 합니다. 과실 범위와 신뢰도는 코드가 계산합니다.",
    glyph: (
      <>
        <path d="M30 56H210M30 50V62M75 50V62M120 50V62M165 50V62M210 50V62" />
        <path className="stroke-accent" d="M66 56H102" strokeWidth="6" />
        <path d="M102 30V44" />
      </>
    ),
  },
];

export function Process() {
  return (
    <section id="process" aria-labelledby="process-title">
      <SectionLabel index="01" aside="올리면 나머지는 자동입니다">
        분석 과정
      </SectionLabel>
      <Reveal>
        <h2
          id="process-title"
          className="max-w-3xl px-5 py-12 text-3xl leading-tight font-extrabold tracking-[-0.03em] text-ink-strong md:px-10 md:py-16 md:text-5xl"
        >
          충돌 순간부터 찾고, 사실과 판단을 나눕니다
        </h2>
        <div className="cells border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Card key={step.title} index={`0${i + 1}`} badge={<Badge>{step.badge}</Badge>} title={step.title}>
              <p>{step.text}</p>
              <svg aria-hidden viewBox="0 0 240 96" fill="none" stroke="currentColor" className={`mt-5 ${GLYPH}`}>
                {step.glyph}
              </svg>
            </Card>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
