import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PRODUCTS = {
  items: [
    {
      slug: "dashpi-standard",
      name: "DashPi 스탠다드",
      description: "기본 구성입니다.",
      price: 129000,
      specs: {},
      image_url: "/products/dashpi.webp",
    },
    {
      slug: "dashpi-pro",
      name: "DashPi 프로",
      description: "확장 구성입니다.",
      price: 189000,
      specs: {},
      image_url: "/products/dashpi.webp",
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

const usePoster = (context: BrowserContext, baseURL?: string) =>
  context.addCookies([{ name: "aigo-design", value: "poster", url: baseURL! }]);

const designCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((c) => c.name === "aigo-design");

const design = (page: Page) => page.locator("html").getAttribute("data-design");

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("토글로 바꾸면 다른 화면과 새로고침에도 유지되고 다시 되돌린다", async ({ page, context }) => {
  await mockProducts(page);
  await page.goto("/");
  expect(await design(page)).toBe("classic");

  await page.getByRole("button", { name: "포스터 디자인으로 전환" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-design", "poster");
  await expect(page.locator("h1")).toContainText("사고를");
  const cookie = await designCookie(context);
  expect(cookie?.value).toBe("poster");
  expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(364 * 86400);

  await page.reload();
  await expect(page.locator("h1")).toContainText("읽다");
  await page.goto("/login");
  expect(await design(page)).toBe("poster");

  await page.goto("/");
  await page.getByRole("button", { name: "기본 디자인으로 전환" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-design", "classic");
  await expect(page.locator("h1")).toContainText("사고를 판정하는 AI가 아니라");
});

test("서버가 첫 HTML부터 data-design과 토글 이름을 내려 깜빡이지 않는다", async ({ request }) => {
  const res = await request.get("/login", { headers: { cookie: "aigo-design=poster" } });
  const html = await res.text();
  expect(html).toMatch(/<html[^>]*data-design="poster"/);
  expect(html).toContain('aria-label="기본 디자인으로 전환"');
});

test("잘못된 쿠키는 classic으로 읽는다", async ({ request }) => {
  const res = await request.get("/login", { headers: { cookie: "aigo-design=neon" } });
  expect(await res.text()).toMatch(/<html[^>]*data-design="classic"/);
});

test("?design=poster로 열면 쿠키를 쓰고 파라미터 없는 주소로 간다", async ({ page, context }) => {
  await mockProducts(page);
  await page.goto("/?design=poster");
  expect(new URL(page.url()).search).toBe("");
  expect((await designCookie(context))?.value).toBe("poster");
  await expect(page.locator("#report")).toContainText("영상 기반 AI 추정이며 법적 판단이 아닙니다");

  await page.goto("/?design=classic");
  expect(new URL(page.url()).search).toBe("");
  expect(await design(page)).toBe("classic");
});

test("다른 파라미터는 남기고 공개 경로에서 동작한다", async ({ page }) => {
  await page.goto("/login?design=poster&redirect_url=%2Faccount");
  expect(new URL(page.url()).search).toBe("?redirect_url=%2Faccount");
  expect(await design(page)).toBe("poster");
});

test("다른 값은 무시한다", async ({ page, context }) => {
  await mockProducts(page);
  await page.goto("/?design=neon");
  expect(new URL(page.url()).search).toBe("?design=neon");
  expect(await designCookie(context)).toBeUndefined();
  expect(await design(page)).toBe("classic");
});

test("디자인 리다이렉트도 전달 헤더의 공개 주소를 쓴다", async ({ request }) => {
  const res = await request.get("/?design=poster", {
    maxRedirects: 0,
    headers: { "x-forwarded-host": "aigo.example", "x-forwarded-proto": "https" },
  });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toBe("https://aigo.example/");
  expect(res.headers()["set-cookie"]).toContain("aigo-design=poster");
});

test("보호 경로는 design 파라미터가 있어도 로그인으로 보낸다", async ({ request }) => {
  const res = await request.get("/analyses?design=poster", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toContain("/login?redirect_url=%2Fanalyses%3Fdesign%3Dposter");
  expect(res.headers()["set-cookie"] ?? "").not.toContain("aigo-design");
});

test("포스터에서도 보호 경로 진입은 로그인으로 간다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.goto("/");
  await page.locator("#hero").getByRole("link", { name: "사고 영상 분석하기" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
  expect(decodeURIComponent(page.url())).toContain("/analyses/new");
});

test("상품은 API에서 받아 상세로 연결한다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.goto("/");
  const link = page.locator("#products").getByRole("link", { name: /DashPi 프로/ });
  await expect(link).toHaveAttribute("href", "/products/dashpi-pro");
  await expect(link).toContainText("189,000원");
  await page.locator("#hero").getByRole("link", { name: "DashPi 보기" }).click();
  await expect(page.locator("#products")).toBeInViewport();
});

test("상품 API가 실패하면 재시도 화면을 보여 주고 복구한다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page, 500);
  await page.goto("/");
  const products = page.locator("#products");
  await expect(products.getByRole("alert")).toContainText("상품 정보를 불러오지 못했습니다");
  await expect(page.locator("#cta")).toBeAttached();

  await page.unroute("**/api/v1/products*");
  await mockProducts(page);
  await products.getByRole("button", { name: "다시 시도" }).click();
  await expect(products.getByRole("link", { name: /DashPi 스탠다드/ })).toBeVisible();
});

for (const width of [360, 1440]) {
  test(`${width}px에서 가로 스크롤이 없다`, async ({ page, context, baseURL }) => {
    await usePoster(context, baseURL);
    await mockProducts(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.locator("#products").getByRole("link", { name: /DashPi 프로/ })).toBeAttached();
    expect(await overflow(page)).toBe(0);
  });
}

test("360px에서도 토글을 누를 수 있다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await page.getByRole("button", { name: "기본 디자인으로 전환" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-design", "classic");
});

test("움직임이 있고 reduced-motion이면 끄고 숫자는 최종값이다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  const running = () => page.locator("#hero").evaluate((el) => el.getAnimations({ subtree: true }).length);

  await page.goto("/");
  await expect(page.locator("#hero")).toBeVisible();
  expect(await running()).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("#hero")).toBeVisible();
  expect(await running()).toBe(0);
  await expect(page.locator("#story")).toContainText("7.4");
  await expect(page.locator("#report")).toContainText("20~30");
  await expect(page.locator('#story [data-reveal="wait"]')).toHaveCount(0);
});

test("테마 버튼이 포스터 값 안에서 다크로 바꾼다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(243, 243, 239)");
  await page.getByRole("button", { name: "다크 모드로 전환" }).click();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(10, 13, 61)");
});

test("스크롤해도 Nav가 위에 붙어 있다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.goto("/");
  await page.evaluate(() => scrollTo(0, 2000));
  await expect
    .poll(() => page.getByRole("navigation", { name: "주 메뉴" }).evaluate((el) => el.getBoundingClientRect().top))
    .toBe(0);
});

const shiftY = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el: HTMLElement) => {
    const y = el.style.transform.match(/translate3d\(0(?:px)?, (-?[\d.]+)px/)?.[1];
    return y === undefined ? null : Number(y);
  });

const scrollToY = async (page: Page, y: number) => {
  await page.evaluate((top) => scrollTo(0, top), y);
  await page.waitForFunction((top) => Math.abs(scrollY - top) < 2, y);
};

const STORY_TEXT = "#story :is(.pl-label, .pl-chapter-title, .pl-lead, .pl-card)";

test("패럴랙스 층은 서로 다른 속도로 작게 움직인다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect.poll(() => shiftY(page, ".pl-title")).toBe(0);

  await scrollToY(page, 500);
  await expect.poll(() => shiftY(page, ".pl-title")).toBeLessThan(0);
  const title = (await shiftY(page, ".pl-title"))!;
  const phone = (await shiftY(page, ".pl-phone-wrap"))!;
  expect(phone).toBeLessThan(title);

  await scrollToY(page, 5000);
  await scrollToY(page, 850);
  await expect.poll(() => shiftY(page, ".pl-title")).toBeLessThan(title);
  expect(Math.abs((await shiftY(page, ".pl-phone-wrap"))!)).toBeLessThanOrEqual(900 * 0.12 + 1);

  const word = page.locator(".pl-word").first();
  const near = (await shiftY(page, ".pl-word"))!;
  await scrollToY(page, 1200);
  await expect.poll(() => shiftY(page, ".pl-word")).not.toBe(near);
  await expect(word).toBeAttached();
});

test("이야기 글은 양방향으로 나타나고 위로 나가면 사라진다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const first = page.locator("#story .pl-chapter-title").first();
  await expect(first).toHaveAttribute("data-fade", "below");
  await expect(first).toHaveCSS("transition-timing-function", /^cubic-bezier\(0\.42, 0, 0\.58, 1\)/);

  await first.evaluate((el) => el.closest("section")!.scrollIntoView({ block: "center" }));
  await expect(first).toHaveAttribute("data-fade", "in");
  await expect(first).toHaveCSS("opacity", "1");

  await page.locator("#report").evaluate((el) => el.scrollIntoView());
  await expect(first).toHaveAttribute("data-fade", "above");
  await expect(first).toHaveCSS("opacity", "0");

  await first.evaluate((el) => el.closest("section")!.scrollIntoView({ block: "center" }));
  await expect(first).toHaveCSS("opacity", "1");
});

test("이야기 전체를 지나가면 모든 글이 한 번씩 온전히 보인다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.goto("/");
  for (const section of await page.locator("#story section").all()) {
    await section.evaluate((el) => el.scrollIntoView({ block: "center" }));
    for (const item of await section.locator(".pl-label, .pl-chapter-title, .pl-lead, .pl-card").all()) {
      await expect(item).toBeInViewport();
      await expect(item).toHaveCSS("opacity", "1");
    }
  }
});

test("reduced-motion에서는 패럴랙스와 페이드를 쓰지 않는다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#report").evaluate((el) => el.scrollIntoView());
  await page.waitForTimeout(100);

  for (const layer of [".pl-title", ".pl-phone-wrap", ".pl-word"]) expect(await shiftY(page, layer)).toBeNull();
  await expect(page.locator("[data-fade]")).toHaveCount(0);
  for (const item of await page.locator(STORY_TEXT).all()) await expect(item).toHaveCSS("opacity", "1");
});

test("JavaScript 없이도 이야기 글이 보인다", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await usePoster(context, baseURL);
  const page = await context.newPage();
  await page.goto("/");
  for (const item of await page.locator(STORY_TEXT).all()) await expect(item).toHaveCSS("opacity", "1");
  await context.close();
});

test("360px에서는 패럴랙스가 절반이고 스크롤 내내 가로 넘침이 없다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await scrollToY(page, Math.min(y, height - 780));
    expect(await overflow(page)).toBe(0);
  }
  await scrollToY(page, 730);
  await expect.poll(() => shiftY(page, ".pl-phone-wrap")).toBeLessThan(0);
  expect(Math.abs((await shiftY(page, ".pl-phone-wrap"))!)).toBeLessThanOrEqual(780 * 0.06 + 1);
});

test("사고 영상과 프레임이 없다", async ({ page, context, baseURL }) => {
  await usePoster(context, baseURL);
  await mockProducts(page);
  await page.goto("/");
  await expect(page.locator("main video, #hero img, #story img, #report img")).toHaveCount(0);
});
