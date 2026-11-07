import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Badge } from "./Badge";
import { Button, buttonClass } from "./Button";
import { Card } from "./Card";
import { DesignProvider } from "./DesignToggle";
import { Field } from "./Field";
import { Footer } from "./Footer";
import { Marquee } from "./Marquee";
import { Nav } from "./Nav";
import { Notice } from "./Notice";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";
import { Skeleton } from "./Skeleton";

const auth = vi.hoisted(() => ({ isSignedIn: false }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/analyses", useRouter: () => ({ refresh }) }));

type Entry = Pick<IntersectionObserverEntry, "isIntersecting">;
let observers: { callback: (entries: Entry[]) => void; disconnect: ReturnType<typeof vi.fn> }[];

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
  }));
}

beforeEach(() => {
  observers = [];
  auth.isSignedIn = false;
  stubMotion(false);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: (entries: Entry[]) => void) {
        observers.push({ callback, disconnect: this.disconnect });
      }
    },
  );
});

afterEach(cleanup);

test("디자인 토글은 쿠키를 쓰고 화면을 새로 받는다", () => {
  refresh.mockClear();
  render(<Nav />);

  fireEvent.click(screen.getByRole("button", { name: "포스터 디자인으로 전환" }));
  expect(document.cookie).toContain("aigo-design=poster");
  expect(refresh).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: "기본 디자인으로 전환" }));
  expect(document.cookie).toContain("aigo-design=classic");
  expect(refresh).toHaveBeenCalledTimes(2);
});

test("디자인 토글은 첫 렌더부터 서버 값의 이름을 쓴다", () => {
  const html = renderToString(
    <DesignProvider design="poster">
      <Nav />
    </DesignProvider>,
  );

  expect(html).toContain('aria-label="기본 디자인으로 전환"');
});

test("디자인 토글은 새로고침으로 바뀐 서버 값을 따른다", () => {
  const nav = (design: "classic" | "poster") => (
    <DesignProvider design={design}>
      <Nav />
    </DesignProvider>
  );
  const { rerender } = render(nav("classic"));

  rerender(nav("poster"));
  expect(screen.getByRole("button", { name: "기본 디자인으로 전환" })).toBeTruthy();
});

test("Reveal은 reduced-motion에서 바로 보인다", () => {
  stubMotion(true);

  render(<Reveal>내용</Reveal>);

  expect(screen.getByText("내용").dataset.reveal).toBeUndefined();
  expect(observers).toHaveLength(0);
});

test("Reveal은 화면 밖에서 숨고 들어오면 나타난 뒤 관찰을 멈춘다", () => {
  render(<Reveal>내용</Reveal>);
  const el = screen.getByText("내용");

  act(() => observers[0].callback([{ isIntersecting: false }]));
  expect(el.dataset.reveal).toBe("wait");

  act(() => observers[0].callback([{ isIntersecting: true }]));
  expect(el.dataset.reveal).toBe("in");
  expect(observers[0].disconnect).toHaveBeenCalled();
});

test("Reveal은 처음부터 화면 안이면 숨기지 않는다", () => {
  render(<Reveal>내용</Reveal>);

  act(() => observers[0].callback([{ isIntersecting: true }]));

  expect(screen.getByText("내용").dataset.reveal).toBeUndefined();
});

test("Button은 불러오는 동안 누를 수 없다", () => {
  render(<Button loading>결제하기</Button>);

  const button = screen.getByRole("button");
  expect(button).toHaveProperty("disabled", true);
  expect(button.getAttribute("aria-busy")).toBe("true");
});

test("buttonClass는 링크에도 같은 모양을 준다", () => {
  expect(buttonClass({ variant: "secondary" })).not.toBe(buttonClass());
});

test("Field는 라벨과 오류를 입력칸에 연결한다", () => {
  render(<Field label="이메일" hint="가입한 주소" error="형식이 틀렸습니다." />);

  const input = screen.getByLabelText("이메일");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe(
    `${screen.getByText("가입한 주소").id} ${screen.getByText("형식이 틀렸습니다.").id}`,
  );
});

test("오류 없는 Field는 aria-invalid를 달지 않는다", () => {
  render(<Field label="이름" />);

  expect(screen.getByLabelText("이름").hasAttribute("aria-invalid")).toBe(false);
});

test("Badge는 상태 글자를 보여 준다", () => {
  render(<Badge tone="ok">완료</Badge>);

  expect(screen.getByText("완료")).toBeTruthy();
});

test("Card는 번호, 배지, 제목을 보이고 href가 있으면 링크가 된다", () => {
  render(
    <Card index="01" badge={<Badge>판매 중</Badge>} title="DashPi" href="/products/dashpi">
      본문
    </Card>,
  );

  expect(screen.getByText("01")).toBeTruthy();
  expect(screen.getByText("판매 중")).toBeTruthy();
  expect(screen.getByRole("link", { name: "DashPi" }).getAttribute("href")).toBe("/products/dashpi");
});

test("SectionLabel은 01/ 형식으로 번호를 붙인다", () => {
  render(<SectionLabel index="01">분석 과정</SectionLabel>);

  expect(screen.getByText("분석 과정").textContent).toContain("01/");
});

test("Marquee의 복제 띠는 스크린 리더에서 숨긴다", () => {
  render(<Marquee items={["사고 영상", "레포트"]} />);

  expect(screen.getAllByText("사고 영상")).toHaveLength(2);
  expect(screen.getAllByText("사고 영상")[1].closest("[aria-hidden]")).not.toBeNull();
  expect(screen.getAllByText("사고 영상")[0].closest("[aria-hidden]")).toBeNull();
});

test("오류 Notice만 alert로 알린다", () => {
  const { rerender } = render(<Notice>테스트 결제입니다. 실제로 청구되지 않습니다</Notice>);
  expect(screen.queryByRole("alert")).toBeNull();

  rerender(<Notice tone="danger">결제에 실패했습니다.</Notice>);
  expect(screen.getByRole("alert").textContent).toContain("결제에 실패했습니다.");
});

test("Nav는 로그아웃이면 로그인을, 로그인이면 내 정보를 보인다", () => {
  const { rerender } = render(<Nav />);
  expect(screen.getAllByRole("link", { name: "로그인" }).length).toBeGreaterThan(0);

  auth.isSignedIn = true;
  rerender(<Nav />);
  expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "내 정보" }).length).toBeGreaterThan(0);
});

test("Nav는 현재 경로를 표시한다", () => {
  render(<Nav />);

  expect(screen.getAllByRole("link", { name: "내 분석" })[0].getAttribute("aria-current")).toBe("page");
});

test("테마 버튼은 html의 data-theme를 바꾸고 저장한다", () => {
  document.documentElement.dataset.theme = "light";
  render(<Nav />);
  fireEvent.click(screen.getByRole("button", { name: "다크 모드로 전환" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(screen.getByRole("button", { name: "라이트 모드로 전환" })).toBeTruthy();
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

test("Nav 워드마크는 서비스 이름 AIGO다", () => {
  render(<Nav />);
  expect(screen.getByRole("link", { name: "AIGO" }).getAttribute("href")).toBe("/");
});

test("Footer는 캡스톤 가상 서비스임을 밝힌다", () => {
  render(<Footer />);
  expect(screen.getByText(/AIGO는 캡스톤 가상 서비스입니다/)).toBeTruthy();

  expect(screen.getByText(/캡스톤 가상 서비스/)).toBeTruthy();
});

test("Skeleton은 보조 기술에서 숨긴다", () => {
  const { container } = render(<Skeleton className="h-4" />);

  expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
});
