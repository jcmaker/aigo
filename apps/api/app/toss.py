import base64

import httpx

from app.config import settings

CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm"


# 공식 에러 코드 표(docs.tosspayments.com/reference/error-codes)에서 확인한 확정 거절 코드.
# PAY_PROCESS_*는 사용자 중단이다. 그 밖의 코드(409, 429, 5xx, 알 수 없는 코드 포함)는
# 결제 상태를 모르므로 재시도 가능으로 둔다.
REJECTION_CODES = frozenset({
    "REJECT_CARD_COMPANY", "REJECT_CARD_PAYMENT", "REJECT_ACCOUNT_PAYMENT", "INVALID_REJECT_CARD",
    "EXCEED_MAX_ONE_DAY_AMOUNT", "EXCEED_MAX_DAILY_PAYMENT_COUNT", "EXCEED_MAX_PAYMENT_AMOUNT",
    "EXCEED_MAX_MONTHLY_PAYMENT_AMOUNT", "EXCEED_MAX_ONE_DAY_WITHDRAW_AMOUNT",
    "EXCEED_MAX_ONE_TIME_WITHDRAW_AMOUNT", "PAY_PROCESS_CANCELED", "PAY_PROCESS_ABORTED",
})


class TossError(Exception):
    def __init__(self, code: str, message: str, retryable: bool):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


class TossClient:
    def _request(self, method: str, url: str, **kw) -> dict:
        auth = base64.b64encode(f"{settings.toss_secret_key}:".encode()).decode()
        headers = {"Authorization": f"Basic {auth}", **kw.pop("headers", {})}
        try:
            r = httpx.request(method, url, headers=headers, timeout=30, **kw)
        except httpx.HTTPError as e:
            raise TossError("NETWORK_ERROR", "토스 서버에 연결할 수 없습니다.", True) from e
        if r.is_success:
            return r.json()
        try:
            body = r.json()
        except ValueError:
            body = {}
        code = body.get("code", "UNKNOWN")
        raise TossError(code, body.get("message", "결제가 거절되었습니다."), code not in REJECTION_CODES)

    def confirm(self, payment_key: str, order_id: str, amount: int, idempotency_key: str) -> dict:
        return self._request("POST", CONFIRM_URL,
                             json={"paymentKey": payment_key, "orderId": order_id, "amount": amount},
                             headers={"Idempotency-Key": idempotency_key})

    def get_payment(self, payment_key: str) -> dict:
        return self._request("GET", f"https://api.tosspayments.com/v1/payments/{payment_key}")


def get_toss() -> TossClient:
    """FastAPI 의존성. 테스트에서는 dependency_overrides로 바꾼다."""
    return TossClient()
