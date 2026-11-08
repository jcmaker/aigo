import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PosterLanding } from "./PosterLanding";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh: vi.fn() }) }));

const PRODUCT = {
  slug: "dashpi-standard",
  name: "DashPi 스탠다드",
  description: "기본 구성입니다.",
  price: 129000,
  specs: {},
  image_url: "/products/dashpi.webp",
};

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [PRODUCT], total: 1 }))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("히어로는 제목과 두 CTA를 싣는다", () => {
  const { container } = render(<PosterLanding />);
  const hero = within(container.querySelector<HTMLElement>("#hero")!);

  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("사고를");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("읽다");
  expect(hero.getByRole("link", { name: "사고 영상 분석하기" }).getAttribute("href")).toBe("/analyses/new");
  expect(hero.getByRole("link", { name: "DashPi 보기" }).getAttribute("href")).toBe("/#products");
});

test("이야기 3장은 충돌, 근거 시각, 과실 범위 순서다", () => {
  const { container } = render(<PosterLanding />);
  const titles = [...container.querySelectorAll("#story h2")].map((h) => h.textContent);

  expect(titles).toHaveLength(3);
  expect(titles[0]).toContain("충돌");
  expect(titles[1]).toContain("근거");
  expect(titles[2]).toContain("과실");
});

test("레포트 카드는 예시와 고정 안내를 싣는다", () => {
  const { container } = render(<PosterLanding />);
  const report = container.querySelector("#report")!;

  expect(report.textContent).toContain("예시");
  expect(report.textContent).toContain("영상 기반 AI 추정이며 법적 판단이 아닙니다");
});

test("상품은 이름, 가격, 상세 링크를 보여 준다", async () => {
  render(<PosterLanding />);
  const link = await screen.findByRole("link", { name: /DashPi 스탠다드/ });

  expect(link.getAttribute("href")).toBe("/products/dashpi-standard");
  expect(link.textContent).toContain("129,000원");
});

test("마지막 CTA와 푸터의 캡스톤 문구가 있다", () => {
  const { container } = render(<PosterLanding />);

  expect(within(container.querySelector<HTMLElement>("#cta")!).getByRole("link", { name: "사고 영상 분석하기" })).toBeTruthy();
  expect(container.querySelector("footer")!.textContent).toContain("캡스톤 가상 서비스");
});
