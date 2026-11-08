import Link from "next/link";

// 반전 면 위라서 buttonClass 색을 쓸 수 없다.
const BUTTON =
  "inline-flex h-12 items-center justify-center px-[22px] text-[15px] font-bold whitespace-nowrap transition-colors duration-[var(--dur-hover)]";

export function CtaBand() {
  return (
    <section id="cta" aria-labelledby="cta-title" className="relative overflow-hidden bg-invert-bg text-invert-fg">
      <svg
        aria-hidden
        viewBox="0 0 1280 400"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
        stroke="currentColor"
        className="absolute inset-0 hidden size-full opacity-30 sm:block"
      >
        <path d="M980 60-200 400M980 60 2160 400M980 60 700 400M980 60 1260 400" />
        <path strokeDasharray="20 22" d="M980 60 420 400M980 60 1540 400" />
      </svg>
      <div className="relative flex flex-col gap-8 px-5 py-16 md:px-10 md:py-24">
        <h2 id="cta-title" className="max-w-3xl text-4xl leading-[1.15] font-extrabold tracking-[-0.03em] md:text-6xl">
          당황한 순간, 다음에 할 일부터 정리합니다
        </h2>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/analyses/new" className={`${BUTTON} bg-invert-fg text-invert-bg hover:bg-accent hover:text-white`}>
            사고 영상 분석하기
          </Link>
          <a href="#products" className={`${BUTTON} border border-invert-fg/40 hover:border-invert-fg`}>
            DashPi 보기
          </a>
        </div>
      </div>
    </section>
  );
}
