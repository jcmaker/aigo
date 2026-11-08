const MESSAGES: Record<string, string> = {
  form_identifier_exists: "이미 가입된 이메일입니다. 로그인해 주세요.",
  form_identifier_not_found: "가입된 이메일을 찾지 못했습니다.",
  form_password_incorrect: "이메일 또는 비밀번호가 맞지 않습니다.",
  form_password_length_too_short: "비밀번호는 15자 이상이어야 합니다.",
  form_password_pwned: "유출된 적 있는 비밀번호입니다. 다른 비밀번호를 사용해 주세요.",
  form_password_not_strong_enough: "더 길고 추측하기 어려운 비밀번호를 사용해 주세요. (15자 이상)",
  form_password_validation_failed: "비밀번호가 맞지 않습니다.",
  form_param_format_invalid: "입력 형식이 올바르지 않습니다.",
  form_param_nil: "필수 항목을 입력해 주세요.",
  form_code_incorrect: "인증 코드가 맞지 않습니다. 다시 확인해 주세요.",
  verification_failed: "인증에 실패했습니다. 코드를 다시 받아 주세요.",
  verification_expired: "인증 코드가 만료되었습니다. 코드를 다시 받아 주세요.",
  too_many_requests: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  session_exists: "이미 로그인되어 있습니다.",
  identifier_already_signed_in: "이미 로그인되어 있습니다.",
  strategy_for_user_invalid: "이 계정은 다른 방식으로 로그인해야 합니다. 소셜 로그인을 사용해 보세요.",
  external_account_not_found: "연결된 소셜 계정을 찾지 못했습니다.",
  oauth_access_denied: "소셜 로그인이 취소되었습니다.",
  protect_check_script_load_failed: "보안 확인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  protect_check_execution_failed: "보안 확인을 마치지 못했습니다. 다시 시도해 주세요.",
  clerk_network_error: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
  network_error: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
};

const FALLBACK = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** Clerk 오류를 code로 찾아 한국어 문구로 바꾼다. 모르는 code는 영어 원문을 노출하지 않는다. */
export function clerkMessage(error: unknown): string {
  // 우리 API 오류는 서버가 한국어 문장을 이미 준다.
  if (error instanceof Error && error.name === "ApiError") return error.message;
  // 새 훅은 ClerkError({code}), user.update 같은 리소스 메서드는 {errors: [{code}]}로 던진다.
  const e = error as { code?: string; errors?: { code?: string }[] } | null;
  // 서버 응답 오류는 바깥 code가 api_response_error라서 안쪽 code까지 봐야 한다.
  const codes = [e?.code, e?.errors?.[0]?.code];
  if (codes.some((c) => c?.startsWith("protect_check"))) return MESSAGES.protect_check_execution_failed;
  const known = codes.find((c) => c && MESSAGES[c]);
  return known ? MESSAGES[known] : FALLBACK;
}
