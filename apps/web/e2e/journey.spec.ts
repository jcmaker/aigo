import { writeFileSync } from "node:fs";
import { expect, test, type Frame, type Page } from "@playwright/test";

// 실제 서비스를 처음부터 끝까지 돈다. 클립은 저장소에 없으므로 경로를 환경변수로 받는다.
//   E2E_VIDEO=<영상> [E2E_SHOTS=<캡처 폴더>] [BASE_URL=<웹 주소>] pnpm playwright test e2e/journey.spec.ts
const VIDEO = process.env.E2E_VIDEO;
const SHOTS = process.env.E2E_SHOTS;

// Clerk Protect가 headless Chromium을 멈추므로 창을 띄운 Chrome으로 돈다.
test.use({ channel: "chrome", headless: false, viewport: { width: 1280, height: 900 }, locale: "ko-KR" });
test.setTimeout(10 * 60_000);
test.skip(!VIDEO, "E2E_VIDEO가 없으면 건너뛴다");

const shot = (page: Page, name: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : undefined);

/** 토스 테스트 환경의 퀵계좌이체 데모. 비밀번호 000000은 데모 화면이 알려 주는 값이다. */
async function payWithTossDemo(page: Page) {
  const methods = page.frameLocator('iframe[src*="payment-methods"]');
  await methods.getByText("퀵계좌이체").first().waitFor({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "결제하기" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "결제하기" }).click();

  const demo = (): Frame | undefined => page.frames().find((f) => f.url().includes("toss.im/account-pay/demo"));
  const deadline = Date.now() + 90_000;
  let last = "";
  while (!page.url().includes("/checkout/success") && Date.now() < deadline) {
    await page.waitForTimeout(1500);
    const frame = demo();
    if (!frame || frame.url() === last) continue;
    last = frame.url();
    if (/signin|\/pin/.test(frame.url())) {
      for (let i = 0; i < 6; i++) await frame.getByText("0", { exact: true }).click();
    } else {
      await frame.getByRole("button").filter({ hasText: /^(다음|결제하기)$/ }).last().click();
    }
  }
}

test("가입 → 테스트 결제 → 업로드 → 레포트 → 삭제 → 탈퇴", async ({ page }) => {
  const steps: Record<string, unknown> = {};
  const timed = async (name: string, run: () => Promise<unknown>) => {
    const started = Date.now();
    await run();
    steps[name] = { seconds: (Date.now() - started) / 1000 };
    await shot(page, name);
  };

  page.on("dialog", (d) => d.accept()); // 삭제 확인창

  const email = `aigo-e2e-${Date.now()}+clerk_test@example.com`;
  const password = `Aigo-e2e-${Math.random().toString(36).slice(2)}-pw!`;

  await timed("01-signup", async () => {
    await page.goto("/signup");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "가입하기" }).click();
    await page.getByLabel("인증 코드").fill("424242");
    await page.getByRole("button", { name: "확인" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/signup"));
  });

  await timed("02-product", async () => {
    await page.goto("/products/dashpi-standard");
    await expect(page.getByRole("heading", { name: "DashPi 스탠다드" })).toBeVisible();
    await page.getByRole("link", { name: "구매하기" }).click();
    await page.waitForURL(/\/checkout/);
    await page.getByLabel("받는 사람").fill("테스트");
    await page.getByLabel("연락처").fill("01012345678");
    await page.getByLabel("주소", { exact: true }).fill("서울시 테스트로 1");
    await page.getByRole("button", { name: "주문하고 결제 진행" }).click();
  });

  await timed("03-payment", async () => {
    await payWithTossDemo(page);
    await page.waitForURL(/\/checkout\/success/);
    await expect(page.getByText("결제가 완료되었습니다")).toBeVisible();
  });

  await timed("04-orders", async () => {
    await page.goto("/account/orders");
    await expect(page.getByText("DashPi 스탠다드")).toBeVisible();
    await expect(page.getByText("결제 완료")).toBeVisible();
  });

  let submittedAt = 0;
  await timed("05-upload", async () => {
    await page.goto("/analyses/new");
    await page.locator('input[type="file"]').setInputFiles(VIDEO!);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "올리고 분석 시작" }).click();
    await page.waitForURL(/\/analyses\/\d+$/, { timeout: 120_000 });
    submittedAt = Date.now();
  });

  await timed("06-progress", async () => {
    await expect(page.getByText("객체 추적")).toBeVisible({ timeout: 60_000 });
  });

  await timed("07-report", async () => {
    await expect(page.getByText("영상 기반 AI 추정이며 법적 판단이 아닙니다").first()).toBeVisible({ timeout: 300_000 });
    steps.processing_seconds = (Date.now() - submittedAt) / 1000;
  });

  await timed("08-seek-overlay", async () => {
    const video = page.locator("video");
    await page.waitForTimeout(1000); // 레포트가 다 그려질 시간
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 }).toBeGreaterThan(0);
    // 사고 장면을 찾지 못한 레포트(involvement none)에는 근거 시각이 없어 영상을 직접 옮긴다.
    const link = page.getByRole("button", { name: /장면으로 이동$/ }).first();
    const label = (await link.count()) ? await link.getAttribute("aria-label") : null;
    if (label) await link.click();
    else await video.evaluate((v: HTMLVideoElement) => void (v.currentTime = v.duration / 2));
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 }).toBeGreaterThan(1);
    const boxes = page.locator("video + div > div");
    await expect.poll(() => boxes.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    steps.seek = { label, currentTime: await video.evaluate((v: HTMLVideoElement) => v.currentTime), boxes: await boxes.count() };
  });

  await timed("09-delete", async () => {
    const detail = page.url();
    await page.getByRole("button", { name: "분석 삭제" }).click();
    await page.waitForURL(/\/analyses$/);
    await page.goto(detail);
    await expect(page.getByText("분석을 찾을 수 없습니다.")).toBeVisible();
  });

  await timed("10-withdraw", async () => {
    await page.goto("/account");
    await page.getByLabel("확인 문구").fill("탈퇴합니다");
    await page.getByRole("button", { name: "회원 탈퇴" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
    await page.goto("/account");
    await page.waitForURL(/\/login/);
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "오류" })).toBeVisible(); // Next 경로 안내도 alert라서 거른다
  });

  if (SHOTS) writeFileSync(`${SHOTS}/journey.json`, JSON.stringify({ base: page.url(), steps }, null, 2));
});
