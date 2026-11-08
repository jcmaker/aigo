import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AccountPanel } from "./AccountPanel";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { SocialButtons } from "./SocialButtons";
import { clerkMessage } from "./clerkErrors";
import { safeRedirect } from "./redirect";
import SsoCallbackPage from "@/app/sso-callback/page";

// user-event 의존성을 늘리지 않으려고 fireEvent로 감싼다.
const userEvent = {
  setup: () => ({
    type: (el: Element, text: string) => act(async () => void fireEvent.change(el, { target: { value: text } })),
    clear: (el: Element) => act(async () => void fireEvent.change(el, { target: { value: "" } })),
    click: (el: Element) => act(async () => void fireEvent.click(el)),
  }),
};

const ok = () => Promise.resolve({ error: null });
const m = vi.hoisted(() => ({
  signIn: {} as Record<string, any>,
  signUp: {} as Record<string, any>,
  user: {} as Record<string, any>,
  signOut: vi.fn(),
  request: vi.fn(),
  push: vi.fn(),
  signInErrors: { global: null } as Record<string, any>,
  signUpErrors: { global: null } as Record<string, any>,
  sso: null as any,
}));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({ signIn: m.signIn, errors: m.signInErrors, fetchStatus: "idle" }),
  useSignUp: () => ({ signUp: m.signUp, errors: m.signUpErrors, fetchStatus: "idle" }),
  useUser: () => ({ isLoaded: true, user: m.user }),
  useClerk: () => ({ signOut: m.signOut }),
  useAuth: () => ({ isSignedIn: false }),
  HandleSSOCallback: (props: unknown) => {
    m.sso = props;
    return null;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push, replace: m.push }) }));
vi.mock("next/link", () => ({ default: ({ href, ...p }: any) => <a href={href} {...p} /> }));
vi.mock("@/components/ui/Nav", () => ({ Nav: () => null }));
vi.mock("@/lib/api", () => ({ useApi: () => ({ request: m.request }) }));

const PASSWORD = "correct-horse-battery";

beforeEach(() => {
  m.signIn = {
    status: "needs_identifier",
    supportedSecondFactors: [{ strategy: "email_code" }],
    create: vi.fn(ok),
    password: vi.fn(ok),
    sso: vi.fn(ok),
    finalize: vi.fn(ok),
    reset: vi.fn(ok),
    mfa: { sendEmailCode: vi.fn(ok), verifyEmailCode: vi.fn(ok) },
    resetPasswordEmailCode: { sendCode: vi.fn(ok), verifyCode: vi.fn(ok), submitPassword: vi.fn(ok) },
  };
  m.signInErrors = { global: null };
  m.signUpErrors = { global: null };
  sessionStorage.clear();
  m.signUp = {
    id: undefined,
    status: null,
    missingFields: [],
    unverifiedFields: [],
    reset: vi.fn(ok),
    password: vi.fn(() => {
      m.signUp.status = "missing_requirements";
      m.signUp.unverifiedFields = ["email_address"];
      return ok();
    }),
    finalize: vi.fn(ok),
    verifications: { sendEmailCode: vi.fn(ok), verifyEmailCode: vi.fn(ok) },
  };
  m.user = {
    fullName: "홍길동",
    firstName: "홍길동",
    primaryEmailAddress: { emailAddress: "a@b.co" },
    passwordEnabled: true,
    update: vi.fn(() => Promise.resolve()),
    setProfileImage: vi.fn(() => Promise.resolve()),
    updatePassword: vi.fn(() => Promise.resolve()),
  };
  m.request.mockResolvedValue(undefined);
  m.signOut.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("가입 후 이메일 코드 화면으로 넘어간다", async () => {
  const user = userEvent.setup();
  render(<SignupForm />);
  await user.type(screen.getByLabelText("이메일"), "a@b.co");
  await user.type(screen.getByLabelText("비밀번호"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "가입하기" }));

  expect(m.signUp.password).toHaveBeenCalledWith({ emailAddress: "a@b.co", password: PASSWORD });
  expect(m.signUp.verifications.sendEmailCode).toHaveBeenCalledTimes(1);
  expect(await screen.findByLabelText("인증 코드")).toBeTruthy();

  m.signUp.verifications.verifyEmailCode.mockImplementation(() => {
    m.signUp.status = "complete";
    return ok();
  });
  await user.type(screen.getByLabelText("인증 코드"), "424242");
  await user.click(screen.getByRole("button", { name: "확인" }));
  expect(m.signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "424242" });
  await waitFor(() => expect(m.signUp.finalize).toHaveBeenCalled());
});

test("회원가입과 재설정 화면은 비밀번호 15자 규칙을 보여 준다", async () => {
  render(<SignupForm />);
  expect(screen.getByText(/15자 이상/)).toBeTruthy();
  cleanup();
  render(<ForgotPasswordForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("이메일"), "a@b.co");
  await user.click(screen.getByRole("button", { name: "코드 보내기" }));
  await user.type(await screen.findByLabelText("인증 코드"), "123456");
  await user.click(screen.getByRole("button", { name: "확인" }));
  expect((await screen.findAllByText(/15자 이상/)).length).toBeGreaterThan(0);
});

test("코드를 다시 보낼 수 있다", async () => {
  const user = userEvent.setup();
  render(<SignupForm />);
  await user.type(screen.getByLabelText("이메일"), "a@b.co");
  await user.type(screen.getByLabelText("비밀번호"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "가입하기" }));
  await user.click(await screen.findByRole("button", { name: "코드 다시 보내기" }));
  expect(m.signUp.verifications.sendEmailCode).toHaveBeenCalledTimes(2);
});

test("비밀번호 재설정은 코드 확인 후 새 비밀번호를 받는다", async () => {
  const user = userEvent.setup();
  render(<ForgotPasswordForm />);
  await user.type(screen.getByLabelText("이메일"), "a@b.co");
  await user.click(screen.getByRole("button", { name: "코드 보내기" }));
  expect(m.signIn.create).toHaveBeenCalledWith({ identifier: "a@b.co" });
  expect(m.signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalled();

  expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
  await user.type(await screen.findByLabelText("인증 코드"), "424242");
  await user.click(screen.getByRole("button", { name: "확인" }));
  expect(m.signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: "424242" });

  await user.type(await screen.findByLabelText("새 비밀번호"), PASSWORD);
  m.signIn.resetPasswordEmailCode.submitPassword.mockImplementation(() => {
    m.signIn.status = "complete";
    return ok();
  });
  await user.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
  expect(m.signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({
    password: PASSWORD,
    signOutOfOtherSessions: true,
  });
  await waitFor(() => expect(m.signIn.finalize).toHaveBeenCalled());
});

test("로그인의 needs_client_trust 상태를 코드 화면으로 처리한다", async () => {
  const user = userEvent.setup();
  m.signIn.password.mockImplementation(() => {
    m.signIn.status = "needs_client_trust";
    return ok();
  });
  render(<LoginForm redirectUrl="/analyses" />);
  await user.type(screen.getByLabelText("이메일"), "a@b.co");
  await user.type(screen.getByLabelText("비밀번호"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "로그인" }));

  expect(m.signIn.password).toHaveBeenCalledWith({ emailAddress: "a@b.co", password: PASSWORD });
  await waitFor(() => expect(m.signIn.mfa.sendEmailCode).toHaveBeenCalled());

  m.signIn.mfa.verifyEmailCode.mockImplementation(() => {
    m.signIn.status = "complete";
    return ok();
  });
  await user.type(await screen.findByLabelText("인증 코드"), "424242");
  await user.click(screen.getByRole("button", { name: "확인" }));
  expect(m.signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "424242" });
  await waitFor(() => expect(m.signIn.finalize).toHaveBeenCalled());
});

test("로그인 오류는 한국어로 보이고 비밀번호 입력은 유지된다", async () => {
  const user = userEvent.setup();
  m.signIn.password.mockResolvedValueOnce({
    error: { code: "form_password_incorrect", message: "Password is incorrect." },
  });
  render(<LoginForm />);
  await user.type(screen.getByLabelText("이메일"), "a@b.co");
  await user.type(screen.getByLabelText("비밀번호"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "로그인" }));
  expect(await screen.findByText(/비밀번호가 맞지 않습니다/)).toBeTruthy();
  expect((screen.getByLabelText("비밀번호") as HTMLInputElement).value).toBe(PASSWORD);
});

test("소셜 버튼은 Google, Apple, Facebook 순서로 signIn.sso를 부른다", async () => {
  const user = userEvent.setup();
  render(<SocialButtons redirectUrl="/analyses" />);
  const names = screen.getAllByRole("button").map((b) => b.textContent);
  expect(names).toEqual(["Google로 계속하기", "Apple로 계속하기", "Facebook으로 계속하기"]);

  for (const [name, strategy] of [
    ["Google로 계속하기", "oauth_google"],
    ["Apple로 계속하기", "oauth_apple"],
    ["Facebook으로 계속하기", "oauth_facebook"],
  ]) {
    await user.click(screen.getByRole("button", { name }));
    expect(m.signIn.sso).toHaveBeenLastCalledWith({
      strategy,
      redirectCallbackUrl: "/sso-callback",
      redirectUrl: "/analyses",
    });
  }
});

test("Clerk 영어 오류를 한국어 문구로 바꾼다", () => {
  expect(clerkMessage({ code: "form_identifier_exists", message: "That email address is taken." })).toMatch(/이미 가입/);
  expect(clerkMessage({ code: "form_code_incorrect", message: "Incorrect code" })).toMatch(/코드/);
  expect(clerkMessage({ code: "form_password_length_too_short", message: "x" })).toMatch(/15자/);
  const unknown = clerkMessage({ code: "something_new", message: "English only text" });
  expect(unknown).not.toMatch(/English/);
  expect(unknown).toMatch(/[가-힣]/);
});

test("redirect_url은 사이트 내부 경로만 허용한다", () => {
  expect(safeRedirect("/analyses/new?x=1")).toBe("/analyses/new?x=1");
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "", undefined, null]) {
    expect(safeRedirect(bad)).toBe("/");
  }
});

test("프로필 이름 변경에 실패하면 입력값을 유지한다", async () => {
  const user = userEvent.setup();
  m.user.update.mockRejectedValueOnce({ errors: [{ code: "form_param_format_invalid", message: "bad" }] });
  render(<AccountPanel />);
  const input = screen.getByLabelText("이름") as HTMLInputElement;
  await user.clear(input);
  await user.type(input, "김철수");
  await user.click(screen.getByRole("button", { name: "이름 저장" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(input.value).toBe("김철수");

  await user.click(screen.getByRole("button", { name: "이름 저장" }));
  expect(m.user.update).toHaveBeenLastCalledWith({ firstName: "김철수", lastName: "" });
  expect(await screen.findByText("저장했습니다.")).toBeTruthy();
});

test("탈퇴는 확인 문구를 입력해야 실행된다", async () => {
  const user = userEvent.setup();
  render(<AccountPanel />);
  const button = screen.getByRole("button", { name: "회원 탈퇴" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);

  fireEvent.change(screen.getByLabelText(/확인 문구/), { target: { value: "탈퇴 안함" } });
  expect(button.disabled).toBe(true);

  fireEvent.change(screen.getByLabelText(/확인 문구/), { target: { value: "탈퇴합니다" } });
  expect(button.disabled).toBe(false);
  await user.click(button);

  expect(m.request).toHaveBeenCalledWith("/api/v1/me", { method: "DELETE" });
  await waitFor(() => expect(m.signOut).toHaveBeenCalledWith({ redirectUrl: "/" }));
  expect(m.request.mock.invocationCallOrder[0]).toBeLessThan(m.signOut.mock.invocationCallOrder[0]);
});

test("탈퇴 API가 실패하면 로그아웃하지 않는다", async () => {
  const user = userEvent.setup();
  m.request.mockRejectedValueOnce(new Error("boom"));
  render(<AccountPanel />);
  fireEvent.change(screen.getByLabelText(/확인 문구/), { target: { value: "탈퇴합니다" } });
  await user.click(screen.getByRole("button", { name: "회원 탈퇴" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(m.signOut).not.toHaveBeenCalled();
});

test("소셜 로그인 뒤 새 기기 확인이 남아 있으면 로그인 화면이 바로 코드 단계로 간다", async () => {
  m.signIn.status = "needs_client_trust";
  render(<LoginForm />);
  expect(await screen.findByLabelText("인증 코드")).toBeTruthy();
  expect(m.signIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("비밀번호")).toBeNull();
});

test("소셜 로그인 뒤 2단계 인증이 남아 있어도 코드 단계로 간다", async () => {
  m.signIn.status = "needs_second_factor";
  render(<LoginForm />);
  expect(await screen.findByLabelText("인증 코드")).toBeTruthy();
});

test("Protect나 SSO 단계가 실패한 오류를 로그인과 가입 화면에 보여 준다", () => {
  m.signInErrors = { global: [{ code: "protect_check_execution_failed", message: "Protect failed" }] };
  render(<LoginForm />);
  expect(screen.getByRole("alert").textContent).toMatch(/보안 확인/);
  cleanup();
  m.signUpErrors = { global: [{ code: "external_account_not_found", message: "x" }] };
  render(<SignupForm />);
  expect(screen.getByRole("alert").textContent).toMatch(/소셜 계정/);
});

test("진행 중인 가입에 비밀번호만 없으면 비밀번호 칸만 보여 준다", async () => {
  const user = userEvent.setup();
  Object.assign(m.signUp, { id: "s1", status: "missing_requirements", missingFields: ["password"], unverifiedFields: ["email_address"] });
  render(<SignupForm />);
  expect(screen.queryByLabelText("이메일")).toBeNull();
  await user.type(screen.getByLabelText("비밀번호"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "가입 마치기" }));
  expect(m.signUp.password).toHaveBeenCalledWith({ password: PASSWORD });
  expect(await screen.findByLabelText("인증 코드")).toBeTruthy();
});

test("진행 중인 가입에 이메일 확인만 남았으면 코드 단계로 간다", async () => {
  Object.assign(m.signUp, { id: "s1", status: "missing_requirements", missingFields: [], unverifiedFields: ["email_address"] });
  render(<SignupForm />);
  expect(await screen.findByLabelText("인증 코드")).toBeTruthy();
  expect(m.signUp.verifications.sendEmailCode).toHaveBeenCalledTimes(1);
});

test("진행 중인 가입에 다른 항목이 비어 있으면 안내와 처음부터 다시 버튼을 보여 준다", async () => {
  const user = userEvent.setup();
  Object.assign(m.signUp, { id: "s1", status: "missing_requirements", missingFields: ["protect_check"], unverifiedFields: [] });
  render(<SignupForm />);
  expect(screen.getByRole("alert").textContent).toMatch(/처음부터 다시/);
  await user.click(screen.getByRole("button", { name: "처음부터 다시" }));
  expect(m.signUp.reset).toHaveBeenCalled();
  expect(await screen.findByLabelText("이메일")).toBeTruthy();
});

test("Clerk Protect 오류 코드를 한국어로 바꾼다", () => {
  expect(clerkMessage({ code: "protect_check_script_load_failed", message: "x" })).toMatch(/보안 확인/);
  expect(clerkMessage({ code: "protect_check_whatever", message: "English" })).toMatch(/보안 확인/);
});

test("redirect_url이 배열이면 첫 값만 쓴다", () => {
  expect(safeRedirect(["/account", "https://evil.com"])).toBe("/account");
  expect(safeRedirect(["https://evil.com", "/account"])).toBe("/");
});

test("세션 작업이 남아 있으면 조용히 멈추지 않고 안내한다", async () => {
  const user = userEvent.setup();
  m.signIn.password.mockImplementation(() => {
    m.signIn.status = "complete";
    return ok();
  });
  m.signIn.finalize.mockImplementation(async ({ navigate }: any) => {
    await navigate({ session: { currentTask: { key: "setup-mfa" } }, decorateUrl: (u: string) => u });
    return { error: null };
  });
  render(<LoginForm />);
  await user.type(screen.getByLabelText("이메일"), "a@b.co");
  await user.type(screen.getByLabelText("비밀번호"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "로그인" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/계정 설정/);
  expect(m.push).not.toHaveBeenCalled();
});

test("sso-callback은 상태에 따라 앱, 로그인, 가입으로 보낸다", () => {
  sessionStorage.setItem("aigo:after-auth", "/analyses");
  render(<SsoCallbackPage />);
  const done = { session: {}, decorateUrl: (u: string) => u };
  m.sso.navigateToApp(done);
  m.sso.navigateToApp(done); // 두 번 불려도 도착지가 같다
  expect(m.push.mock.calls).toEqual([["/analyses"], ["/analyses"]]);
  m.sso.navigateToSignIn();
  m.sso.navigateToSignUp();
  expect(m.push).toHaveBeenCalledWith("/login");
  expect(m.push).toHaveBeenCalledWith("/signup");
});

test("sso-callback에서 세션 작업이 남아 있으면 안내를 보여 준다", async () => {
  render(<SsoCallbackPage />);
  await act(async () => m.sso.navigateToApp({ session: { currentTask: { key: "x" } }, decorateUrl: (u: string) => u }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/계정 설정/);
  expect(m.push).not.toHaveBeenCalled();
});

test("바깥 code를 모르면 안쪽 Clerk 오류 코드로 문구를 고른다", () => {
  const error = { code: "api_response_error", errors: [{ code: "form_identifier_not_found" }] };
  expect(clerkMessage(error)).toBe("가입된 이메일을 찾지 못했습니다.");
});
