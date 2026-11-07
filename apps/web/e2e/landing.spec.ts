import { expect, test, type Page } from "@playwright/test";

const PRODUCTS = {
  items: [
    {
      slug: "dashpi-standard",
      name: "DashPi 스탠다드",
      description: "기본 구성입니다.",
      price: 129000,
      specs: { 구성: "블랙박스 본체, 거치대, 전원 케이블", 저장: "microSD 카드 별도" },
      image_url: "",
    },
    {
      slug: "dashpi-pro",
      name: "DashPi 프로",
      description: "확장 구성입니다.",
      price: 189000,
      specs: { 구성: "블랙박스 본체, 후방 카메라, 거치대, 전원 케이블", 저장: "microSD 카드 별도" },
      image_url: "",
    },
  ],
  total: 2,
};

const mockProducts = (page: Page, status = 200) =>
  page.route("**/api/v1/products*", (route) =>
    status === 200
      ? route.fulfill({ json: PRODUCTS })
      : route.fulfill({ status, json: { code: "INTERNAL_ERROR", message: "서버 오류" } }),
  );

test("두 CTA가 각 화면으로 이동한다", async ({ page }) => {
  await mockProducts(page);
  await page.goto("/");
  const hero = page.locator("#hero");

  await hero.getByRole("link", { name: "DashPi 보기" }).click();
  await expect(page).toHaveURL(/\/#products$/);
  await expect(page.locator("#products")).toBeInViewport();

  await hero.getByRole("link", { name: "사고 영상 분석하기" }).click();
  // 로그인하지 않았으므로 proxy가 로그인 화면으로 보내고 돌아갈 곳을 남긴다.
  await page.waitForURL((url) => url.pathname === "/login");
  expect(decodeURIComponent(page.url())).toContain("/analyses/new");
});

test("섹션이 정해진 순서로 놓인다", async ({ page }) => {
  await mockProducts(page);
  await page.goto("/");
  const ids = await page.locator("main > section").evaluateAll((all) => all.map((s) => s.id));
  expect(ids).toEqual(["hero", "process", "report", "products", "principles", "cta"]);
  await expect(page.locator("h1")).toContainText("사고를 판정하는 AI가 아니라");
  await expect(page.locator("h1")).toContainText("높이는 AI");
  await expect(page.locator("#hero")).toContainText("AIGO의 사고분석");
});

test("상품 API 응답을 카드로 보여 준다", async ({ page }) => {
  await mockProducts(page);
  await page.goto("/");
  const products = page.locator("#products");
  await expect(products.getByRole("link", { name: "DashPi 프로" })).toHaveAttribute("href", "/products/dashpi-pro");
  await expect(products).toContainText("129,000원");
  await expect(products).toContainText("후방 카메라");
});

test("상품 API가 실패해도 페이지가 렌더링된다", async ({ page }) => {
  await mockProducts(page, 500);
  await page.goto("/");
  await expect(page.locator("#products").getByRole("alert")).toContainText("상품 정보를 불러오지 못했습니다");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("#principles")).toBeAttached();
  await expect(page.locator("footer")).toBeAttached();

  // 다시 시도하면 복구된다.
  await page.unroute("**/api/v1/products*");
  await mockProducts(page);
  await page.locator("#products").getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator("#products").getByRole("link", { name: "DashPi 스탠다드" })).toBeVisible();
});

test("상품 API에 연결하지 못해도 페이지가 렌더링된다", async ({ page }) => {
  await page.route("**/api/v1/products*", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#products").getByRole("alert")).toBeVisible();
});

test("상품 API가 200이어도 items가 없으면 실패로 보여 준다", async ({ page }) => {
  await page.route("**/api/v1/products*", (route) => route.fulfill({ json: {} }));
  await page.goto("/");
  await expect(page.locator("#products").getByRole("alert")).toContainText("상품 정보를 불러오지 못했습니다");
  await expect(page.locator("h1")).toBeVisible();
});

test("서비스는 AIGO, 상품은 DashPi로 표시한다", async ({ page }) => {
  await mockProducts(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AIGO/);
  await expect(page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "AIGO" })).toBeVisible();
  await expect(page.locator("footer")).toContainText("AIGO는 캡스톤 가상 서비스입니다");
  await expect(page.locator("footer")).not.toContainText("DashPi");
});

test("레포트 예시는 예시임을 밝히고 고정 안내를 싣는다", async ({ page }) => {
  await mockProducts(page);
  await page.goto("/");
  const report = page.locator("#report");
  await expect(report).toContainText("예시");
  await expect(report).toContainText("영상 기반 AI 추정이며 법적 판단이 아닙니다");
  await expect(page.locator("#hero")).toContainText("예시");
  // 사고 영상과 프레임은 쓰지 않는다. 사진은 상품 영역에만 있다.
  await expect(page.locator("main video, #hero img, #report img")).toHaveCount(0);
});

test("360px에서 가로 스크롤이 없다", async ({ page }) => {
  await mockProducts(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.locator("#products").getByRole("link", { name: "DashPi 프로" })).toBeAttached();
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBe(0);
});

test("푸터에 캡스톤 가상 서비스 표시가 있다", async ({ page }) => {
  await mockProducts(page);
  await page.goto("/");
  await expect(page.locator("footer")).toContainText("캡스톤 가상 서비스");
});

test("reduced-motion에서 띠가 흐르지 않는다", async ({ page }) => {
  await mockProducts(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const track = page.locator(".marquee-track").first();
  await expect(track).toHaveCSS("animation-name", "none");
});

test("장면은 움직이고 reduced-motion에서는 충돌 순간에 멈춘다", async ({ page }) => {
  await mockProducts(page);
  const running = () =>
    page.locator("[data-scene]").evaluate((el) => el.getAnimations({ subtree: true }).length);

  await page.goto("/");
  await expect(page.locator("[data-scene]")).toBeVisible();
  expect(await running()).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("[data-scene]")).toBeVisible();
  expect(await running()).toBe(0);
});
