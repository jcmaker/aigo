"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { DesignToggle, useDesign } from "./DesignToggle";
import { ThemeToggle } from "./ThemeToggle";

const CELL = "flex items-center border-l border-line px-4 text-[13px] font-semibold whitespace-nowrap";
const INVERT =
  "transition-colors duration-[var(--dur-hover)] hover:bg-invert-bg hover:text-invert-fg focus-visible:-outline-offset-2";

export function Nav() {
  const { isSignedIn } = useAuth();
  const design = useDesign();
  const pathname = usePathname();
  const menuId = useId();

  const links = [
    { href: "/#products", label: "상품" },
    { href: "/analyses", label: "내 분석" },
    isSignedIn ? { href: "/account", label: "내 정보" } : { href: "/login", label: "로그인" },
  ];
  const current = (href: string) => (pathname?.startsWith(href) ? "page" : undefined);

  return (
    <nav aria-label="주 메뉴" className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-sm">
      <div className="flex h-12 items-stretch justify-between">
        <Link
          href="/"
          className="flex items-center border-r border-line px-4 font-mono text-sm font-semibold tracking-tight focus-visible:-outline-offset-2 sm:px-5"
        >
          {/* flex 항목이 되면 이름이 "AI GO"로 갈라지므로 한 덩어리로 감싼다 */}
          <span>
            AI<span className="text-accent-ink">GO</span>
          </span>
        </Link>

        <div className="flex items-stretch">
          <div className="hidden items-stretch sm:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current(link.href)}
                className={`${CELL} ${INVERT} text-muted aria-[current=page]:bg-invert-bg aria-[current=page]:text-invert-fg`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <DesignToggle
            design={design}
            className={`flex w-12 items-center justify-center border-l border-line text-muted ${INVERT}`}
          />
          <ThemeToggle className={`flex w-12 items-center justify-center border-l border-line text-muted ${INVERT}`} />
          <Link
            href="/analyses/new"
            className="flex items-center bg-invert-bg px-4 text-[13px] font-bold whitespace-nowrap text-invert-fg transition-colors duration-[var(--dur-hover)] hover:bg-accent-ink focus-visible:-outline-offset-2 sm:px-5"
          >
            영상 분석하기
          </Link>
          <button
            type="button"
            popoverTarget={menuId}
            aria-label="메뉴 열기"
            className={`flex w-12 items-center justify-center text-muted sm:hidden ${INVERT}`}
          >
            <svg aria-hidden width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor">
              <path d="M0 .5h16M0 9.5h16" />
            </svg>
          </button>
        </div>
      </div>

      <div
        id={menuId}
        popover="auto"
        className="fixed inset-x-0 top-12 m-0 w-full border-b border-line bg-bg text-ink"
      >
        <ul>
          {links.map((link) => (
            <li key={link.href} className="border-t border-line first:border-t-0">
              <Link
                href={link.href}
                aria-current={current(link.href)}
                onClick={() => document.getElementById(menuId)?.hidePopover()}
                className={`flex h-12 items-center px-4 font-semibold aria-[current=page]:text-accent-ink ${INVERT}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
