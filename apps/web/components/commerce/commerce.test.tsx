import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CheckoutForm } from "./CheckoutForm";
import { OrderList } from "./OrderList";
import { ProductError } from "./ProductError";
import { QuantityPicker } from "./QuantityPicker";
import type { Order } from "./types";
import { FailView, SuccessView } from "./PaymentResult";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: async () => "tok" }) }));
const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const widgets = vi.hoisted(() => ({
  setAmount: vi.fn(),
  renderPaymentMethods: vi.fn(),
  renderAgreement: vi.fn(),
  requestPayment: vi.fn(),
}));
vi.mock("@tosspayments/tosspayments-sdk", () => ({
  loadTossPayments: vi.fn(async () => ({ widgets: () => widgets })),
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const PRODUCT = { slug: "dashpi-standard", name: "DashPi 표준형", price: 129000, description: "", specs: {}, image_url: "" };
const order = (over: Partial<Order> = {}): Order => ({
  id: 7, toss_order_id: "dashpi_abc", status: "pending", amount: 258000, order_name: "DashPi 표준형 2개",
  product_name: "DashPi 표준형", unit_price: 129000, quantity: 2, recipient_name: "홍길동", phone: "010", address: "서울",
  created_at: "2026-11-05T00:00:00Z", paid_at: null, ...over,
});

const fetchMock = vi.fn();
const calls = (suffix: string) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(suffix));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "test_gck_dummy");
  Object.values(widgets).forEach((f) => f.mockReset());
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function fillAddress() {
  fireEvent.change(screen.getByLabelText("받는 사람"), { target: { value: "홍길동" } });
  fireEvent.change(screen.getByLabelText("연락처"), { target: { value: "01012345678" } });
  fireEvent.change(screen.getByLabelText("주소"), { target: { value: "경기도 안산시" } });
}

test("체크아웃 금액은 서버 응답을 쓴다", async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/v1/me")) return json(200, { id: 3, email: "a@b.c", name: "a" });
    if (url.endsWith("/api/v1/orders") && init?.method === "POST") return json(201, order({ amount: 250000 }));
    return json(404, { code: "X", message: "x" });
  });
  render(<CheckoutForm product={PRODUCT} quantity={2} />);
  expect(screen.getByText("258,000원")).toBeTruthy(); // 화면 추정치
  fillAddress();
  fireEvent.click(screen.getByRole("button", { name: "주문하고 결제 진행" }));

  await waitFor(() => expect(widgets.setAmount).toHaveBeenCalledWith({ currency: "KRW", value: 250000 }));
  expect(screen.getByText("250,000원")).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "결제하기" }));
  await waitFor(() => expect(widgets.requestPayment).toHaveBeenCalled());
  const arg = widgets.requestPayment.mock.calls[0][0];
  expect(arg.orderId).toBe("dashpi_abc");
  expect(arg.successUrl).toMatch(/\/checkout\/success\?order=7$/);
  expect(arg.failUrl).toMatch(/\/checkout\/fail\?order=7$/);
});

test("필수 배송 정보가 없으면 결제 버튼이 비활성화된다", () => {
  render(<CheckoutForm product={PRODUCT} quantity={1} />);
  const btn = screen.getByRole("button", { name: "주문하고 결제 진행" }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  fillAddress();
  expect(btn.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("연락처"), { target: { value: " " } });
  expect(btn.disabled).toBe(true);
});

test("클라이언트 키가 없으면 안내를 보여 주고 죽지 않는다", async () => {
  vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "");
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url.endsWith("/api/v1/me") ? json(200, { id: 3 }) : json(201, order()),
  );
  render(<CheckoutForm product={PRODUCT} quantity={1} />);
  fillAddress();
  fireEvent.click(screen.getByRole("button", { name: "주문하고 결제 진행" }));
  expect(await screen.findByText(/NEXT_PUBLIC_TOSS_CLIENT_KEY/)).toBeTruthy();
});

test("수량 선택은 1~5로 제한된다", () => {
  const onChange = vi.fn();
  render(<QuantityPicker value={5} onChange={onChange} />);
  expect((screen.getByRole("button", { name: "수량 늘리기" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "수량 줄이기" }));
  expect(onChange).toHaveBeenCalledWith(4);
});

const params = { orderId: 7, paymentKey: "pk_1", tossOrderId: "dashpi_abc", amount: 258000 };

function mockSuccessApi(opts: { status?: Order["status"]; confirm?: () => Response } = {}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/orders/7") && !init?.method) return json(200, order({ status: opts.status ?? "pending" }));
    if (url.endsWith("/orders/7/confirm")) return opts.confirm ? opts.confirm() : json(200, order({ status: "paid" }));
    return json(404, { code: "X", message: "x" });
  });
}

test("success는 서버 주문 금액으로 승인하고 StrictMode에서도 한 번만 부른다", async () => {
  mockSuccessApi();
  render(
    <StrictMode>
      <SuccessView {...params} />
    </StrictMode>,
  );
  expect(await screen.findByText("결제가 완료되었습니다")).toBeTruthy();
  expect(calls("/confirm")).toHaveLength(1);
  expect(JSON.parse(calls("/confirm")[0][1].body)).toEqual({ payment_key: "pk_1", amount: 258000 });
});

test("URL 금액이 서버 금액과 다르면 승인하지 않고 오류를 보여 준다", async () => {
  mockSuccessApi();
  render(<SuccessView {...params} amount={1000} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(calls("/confirm")).toHaveLength(0);
});

test("success를 새로고침해도 승인 오류가 나지 않는다", async () => {
  mockSuccessApi({ status: "paid" });
  render(<SuccessView {...params} />);
  expect(await screen.findByText("결제가 완료되었습니다")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(calls("/confirm")).toHaveLength(0);
});

test("PAYMENT_RETRY면 다시 시도 버튼을 보여 준다", async () => {
  let n = 0;
  mockSuccessApi({
    confirm: () => (n++ === 0 ? json(502, { code: "PAYMENT_RETRY", message: "잠시 뒤 다시 시도해 주세요." }) : json(200, order({ status: "paid" }))),
  });
  render(<SuccessView {...params} />);
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("결제가 완료되었습니다")).toBeTruthy();
  expect(calls("/confirm")).toHaveLength(2);
});

test("PAYMENT_REJECTED는 다시 시도 버튼 없이 사유만 보여 준다", async () => {
  mockSuccessApi({ confirm: () => json(402, { code: "PAYMENT_REJECTED", message: "카드 한도 초과" }) });
  render(<SuccessView {...params} />);
  expect(await screen.findByText("카드 한도 초과")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
});

test("fail 화면이 토스 오류 문구를 보여 준다", () => {
  render(<FailView orderId="7" code="PAY_PROCESS_CANCELED" message="사용자가 결제를 취소했습니다." />);
  expect(screen.getByText("사용자가 결제를 취소했습니다.")).toBeTruthy();
  expect(screen.getByText(/PAY_PROCESS_CANCELED/)).toBeTruthy();
});

test("테스트 결제 문구가 체크아웃과 주문 화면에 있다", () => {
  const msg = /테스트 결제입니다\. 실제로 청구되지 않습니다/;
  render(<CheckoutForm product={PRODUCT} quantity={1} />);
  expect(screen.getByText(msg)).toBeTruthy();
  cleanup();
  render(<OrderList orders={[order()]} />);
  expect(screen.getByText(msg)).toBeTruthy();
  expect(screen.getByText("DashPi 표준형 2개")).toBeTruthy();
});

test("상품 오류 화면의 다시 시도는 서버 화면을 새로 받는다", () => {
  render(<ProductError />);
  expect(screen.getByRole("alert").textContent).toContain("상품을 불러오지 못했습니다");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(nav.refresh).toHaveBeenCalled();
});
