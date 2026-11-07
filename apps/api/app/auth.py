import httpx
from clerk_backend_api import Clerk
from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.errors import ApiError
from app.models import User


def get_clerk() -> Clerk:
    """FastAPI 의존성. 테스트에서는 dependency_overrides로 바꾼다."""
    return Clerk(bearer_auth=settings.clerk_secret_key)


def _unauthorized() -> ApiError:
    return ApiError(401, "UNAUTHORIZED", "로그인이 필요합니다.")


def _clerk_down() -> ApiError:
    return ApiError(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서비스에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.")


def _verified_clerk_id(request: Request) -> str:
    # Authorization 헤더만 본다(쿠키 인증 안 씀). jwt_key가 있으면 네트워크 없이 검증한다.
    header = request.headers.get("authorization")
    if not header:
        raise _unauthorized()
    state = authenticate_request(
        httpx.Request("GET", "http://dashpi.invalid/", headers={"Authorization": header}),
        AuthenticateRequestOptions(
            jwt_key=settings.clerk_jwt_key or None,
            secret_key=settings.clerk_secret_key or None,
            accepts_token=["session_token"],
        ),
    )
    payload = state.payload or {}
    sub = payload.get("sub")
    if not state.is_signed_in or not sub:
        raise _unauthorized()
    # 앱(native) 토큰에는 azp가 없다. SDK에 넘기면 거부되므로 azp가 있을 때만 직접 비교한다.
    azp = payload.get("azp")
    if azp and azp not in settings.clerk_authorized_parties:
        raise _unauthorized()
    return sub


def _profile(clerk: Clerk, clerk_user_id: str) -> tuple[str, str]:
    try:
        u = clerk.users.get(user_id=clerk_user_id)
    except Exception as e:
        raise _clerk_down() from e
    primary = next((a for a in u.email_addresses if a.id == u.primary_email_address_id), None)
    email = (primary or (u.email_addresses[0] if u.email_addresses else None))
    name = " ".join(p for p in (u.last_name, u.first_name) if isinstance(p, str) and p)
    return (email.email_address if email else "")[:255], name[:100]


# 이 함수는 동기(def)라서 FastAPI가 스레드풀에서 실행한다. 검증과 Clerk 호출이 이벤트 루프를 막지 않는다.
def current_user(request: Request, db: Session = Depends(get_db), clerk: Clerk = Depends(get_clerk)) -> User:
    clerk_user_id = _verified_clerk_id(request)
    user = db.scalar(select(User).where(User.clerk_user_id == clerk_user_id))
    if user:
        return user
    email, name = _profile(clerk, clerk_user_id)
    # 동시에 첫 요청이 와도 한 행만 만든다. 진 쪽은 DO NOTHING 뒤에 다시 읽는다.
    db.execute(insert(User).values(clerk_user_id=clerk_user_id, email=email, name=name)
               .on_conflict_do_nothing(index_elements=["clerk_user_id"]))
    db.commit()
    return db.scalar(select(User).where(User.clerk_user_id == clerk_user_id))
