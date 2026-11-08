import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Footer } from "@/components/ui/Footer";
import { Marquee } from "@/components/ui/Marquee";
import { Nav } from "@/components/ui/Nav";
import { Notice } from "@/components/ui/Notice";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Skeleton } from "@/components/ui/Skeleton";

const SWATCHES = ["bg", "raised", "sunken", "ink", "muted", "line", "line-strong", "accent", "accent-ink", "ok", "danger"];

function Section({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <section>
      <SectionLabel index={index}>{title}</SectionLabel>
      <div className="flex flex-col gap-6 px-5 py-10 md:px-10">{children}</div>
    </section>
  );
}

function Sheet({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} className="bg-bg text-ink">
      <Nav />
      <main className="frame">
        <header className="px-5 py-14 md:px-10 md:py-20">
          <p className="hud text-muted">디자인 시스템 / {theme === "light" ? "밝은 테마" : "어두운 테마"}</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.08] font-extrabold tracking-[-0.03em] text-ink-strong md:text-6xl">
            사고 대응력을 높이는 <span className="text-accent-ink">AI</span>
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted">
            바탕, 글자, 1px 선으로 만든 화면입니다. 파랑은 강조에, 빨강은 심각도와 오류에만 씁니다.
          </p>
        </header>

        <Section index="01" title="색">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {SWATCHES.map((name) => (
              <li key={name} className="flex flex-col gap-1.5">
                <span className="h-12 border border-line" style={{ background: `var(--${name})` }} />
                <span className="hud text-muted">{name}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section index="02" title="버튼">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">사고 영상 분석하기</Button>
            <Button size="lg" variant="secondary">
              DashPi 보기
            </Button>
            <Button variant="danger">분석 삭제</Button>
            <Button size="sm" variant="secondary">
              다시 시도
            </Button>
            <Button loading>결제하는 중</Button>
            <a href="#" className={buttonClass({ variant: "secondary" })}>
              링크 버튼
            </a>
          </div>
          <div data-surface="landing" className="flex flex-wrap items-center gap-3">
            <Button size="lg">랜딩 버튼</Button>
            <Button size="lg" variant="secondary">
              모서리 0
            </Button>
          </div>
        </Section>

        <Section index="03" title="입력">
          <div className="grid max-w-xl gap-5">
            <Field label="이메일" type="email" placeholder="name@example.com" hint="가입한 주소를 입력하세요." />
            <Field label="비밀번호" type="password" defaultValue="1234" error="8자 이상 입력하세요." />
            <Field label="주문 번호" disabled defaultValue="DP-2026-0001" />
          </div>
        </Section>

        <Section index="04" title="배지">
          <div className="flex flex-wrap gap-6">
            <Badge>대기</Badge>
            <Badge tone="accent">분석 중</Badge>
            <Badge tone="ok">완료</Badge>
            <Badge tone="danger">심각도 높음</Badge>
          </div>
        </Section>

        <section>
          <SectionLabel index="05" aside="1px 틈 칸, 모서리 0">
            카드
          </SectionLabel>
          <div data-surface="landing" className="cells border-b border-line md:grid-cols-3">
            <Card index="01" badge={<Badge tone="accent">분석 중</Badge>} title="영상을 올립니다">
              사고 전후가 담긴 블랙박스 영상을 올립니다.
            </Card>
            <Card index="02" badge={<Badge tone="ok">완료</Badge>} title="상황을 정리합니다" href="#">
              링크 카드는 칸 전체를 누를 수 있습니다.
            </Card>
            <Card index="03" title="레포트를 받습니다">
              대응에 필요한 내용을 글로 받습니다.
            </Card>
          </div>
          <div className="px-5 py-10 md:px-10">
            <div className="max-w-sm">
              <Card index="04" badge={<Badge>앱 화면</Badge>} title="혼자 놓인 카드">
                앱 화면에서는 3px 모서리를 씁니다.
              </Card>
            </div>
          </div>
        </section>

        <Section index="06" title="안내">
          <Notice label="테스트">테스트 결제입니다. 실제로 청구되지 않습니다</Notice>
          <Notice>영상 기반 AI 추정이며 법적 판단이 아닙니다</Notice>
          <Notice tone="danger">결제를 완료하지 못했습니다. 카드 정보를 확인한 뒤 다시 시도해 주세요.</Notice>
        </Section>

        <section>
          <SectionLabel index="07">흐르는 띠</SectionLabel>
          <div className="py-10">
            <Marquee items={["영상 업로드", "객체 추적", "상황 관찰", "대응 레포트", "법적 판단 아님"]} />
          </div>
        </section>

        <Section index="08" title="등장 효과">
          <Reveal>
            <p className="max-w-md text-muted">화면 밖에서 시작한 내용만 스크롤에 맞춰 올라옵니다.</p>
          </Reveal>
        </Section>

        <Section index="09" title="불러오는 중">
          <div className="flex max-w-md flex-col gap-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}

// 폴더 이름이 _design이면 Next가 비공개 폴더로 취급해서 %5F로 적는다.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <Sheet theme="light" />
      <Sheet theme="dark" />
    </>
  );
}
