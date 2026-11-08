import Link from "next/link";

const COLUMNS = [
  {
    title: "서비스",
    links: [
      { href: "/#products", label: "상품" },
      { href: "/analyses/new", label: "사고 영상 분석" },
    ],
  },
  {
    title: "내 계정",
    links: [
      { href: "/account", label: "내 정보" },
      { href: "/account/orders", label: "내 주문" },
      { href: "/analyses", label: "내 분석" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="frame">
        <div className="cells grid-cols-2 md:grid-cols-4">
          <div className="col-span-2 p-5 md:col-span-1 md:p-8">
            <p className="font-mono text-lg font-semibold tracking-tight">
              AI<span className="text-accent-ink">GO</span>
            </p>
            <p className="mt-3 max-w-xs text-muted">사고를 판정하는 AI가 아니라 사고 대응력을 높이는 AI.</p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="p-5 md:p-8">
              <p className="hud text-muted">{column.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-muted transition-colors hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="col-span-2 p-5 md:col-span-1 md:p-8">
            <p className="hud text-muted">안내</p>
            <p className="mt-4 text-muted">
              AIGO는 캡스톤 가상 서비스입니다. 실제 상품을 판매하거나 대금을 청구하지 않습니다.
            </p>
          </div>
        </div>
        <p
          aria-hidden
          className="overflow-hidden border-t border-line text-center font-mono text-[min(38vw,480px)] leading-[1.05] font-semibold tracking-tight text-ink-strong select-none"
        >
          AI<span className="text-accent-ink">GO</span>
        </p>
      </div>
    </footer>
  );
}
