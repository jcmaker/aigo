import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";

const PRINCIPLES = [
  {
    title: "숫자 하나가 아니라 범위로",
    text: "과실비율은 범위로 보여 줍니다. 맞는 기준 도표가 없으면 비율을 내지 않고 그렇다고 말합니다.",
  },
  {
    title: "모든 주장에 근거 시각",
    text: "레포트의 주장에는 영상 시각이 붙습니다. 시각이 없거나 영상 범위를 벗어난 주장은 코드가 버립니다.",
  },
  {
    title: "안 보이면 unknown",
    text: "음주, 무면허처럼 영상으로 확인할 수 없는 항목은 추측하지 않고 unknown으로 남깁니다.",
  },
  {
    title: "법적 판단이 아닙니다",
    text: "레포트는 영상 기반 AI 추정이며 법적 판단이 아닙니다. 대응을 준비하는 참고 자료로 써 주세요.",
  },
  {
    title: "영상은 비공개로",
    text: "영상은 비공개 저장소에 두고 재생은 1시간짜리 서명 주소로만 합니다. 분석할 때 프레임이 AI 모델로 전송되는 점은 업로드 전에 알리고 동의를 받습니다. 삭제하면 파일까지 지웁니다.",
  },
];

export function Principles() {
  return (
    <section id="principles" aria-labelledby="principles-title">
      <SectionLabel index="04" aside="실제 동작 그대로">
        원칙
      </SectionLabel>
      <Reveal>
        <h2
          id="principles-title"
          className="max-w-3xl px-5 py-12 text-3xl leading-tight font-extrabold tracking-[-0.03em] text-ink-strong md:px-10 md:py-16 md:text-5xl"
        >
          모르는 것은 모른다고 말합니다
        </h2>
        <ol className="border-t border-line">
          {PRINCIPLES.map((item, i) => (
            <li
              key={item.title}
              className="grid gap-x-6 gap-y-1 border-b border-line px-5 py-6 transition-colors duration-[var(--dur-hover)] last:border-b-0 hover:bg-raised md:grid-cols-[5rem_minmax(0,5fr)_minmax(0,7fr)] md:px-10 md:py-8"
            >
              <span className="font-mono text-sm font-medium text-accent-ink md:pt-1.5">0{i + 1}</span>
              <h3 className="text-xl leading-snug font-bold tracking-[-0.02em] text-ink-strong md:text-2xl">{item.title}</h3>
              <p className="text-muted md:pt-1">{item.text}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
