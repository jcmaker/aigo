import os

# 실제 키 없이 실행되도록 app import 전에 테스트 설정을 넣는다.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg:///dashpi_test")
os.environ.setdefault("TOSS_SECRET_KEY", "test_sk_dummy")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.errors import ApiError  # noqa: E402
from app.main import create_app  # noqa: E402


# ---- Clerk 인증 테스트 도구: 테스트 전용 RSA 키와 가짜 Clerk 클라이언트 ----
# .env의 실제 Clerk 키가 테스트에 영향을 주지 않도록 매 테스트마다 설정을 덮어쓴다.
import time  # noqa: E402
from types import SimpleNamespace  # noqa: E402

import jwt  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402


def _new_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


_TEST_KEY, _OTHER_KEY = _new_key(), _new_key()
TEST_ORIGIN = "http://localhost:3000"


def _public_pem(key) -> str:
    return key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()


def issue_token(sub: str, email: str, expired: bool = False, *, key=None, azp: str | None = TEST_ORIGIN) -> str:
    now = int(time.time())
    claims = {"sub": sub, "email": email, "iat": now - 3600, "nbf": now - 3600,
              "exp": now - 600 if expired else now + 600}
    if azp is not None:
        claims["azp"] = azp
    return jwt.encode(claims, key or _TEST_KEY, algorithm="RS256")


@pytest.fixture(autouse=True)
def _clerk_test_settings(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "clerk_jwt_key", _public_pem(_TEST_KEY))
    monkeypatch.setattr(settings, "clerk_secret_key", "sk_test_dummy")
    monkeypatch.setattr(settings, "web_origin", TEST_ORIGIN)
    monkeypatch.setattr(settings, "clerk_authorized_parties", [TEST_ORIGIN])


class FakeClerk:
    """clerk.users.get / delete만 흉내 낸다. fail_get / fail_delete로 장애를 만든다."""

    def __init__(self):
        self.deleted: list[str] = []
        self.get_calls: list[str] = []
        self.fail_get = False
        self.fail_delete = False
        self.on_get = None  # 동시성 테스트용 훅
        self.users = SimpleNamespace(get=self._get, delete=self._delete)

    def _get(self, *, user_id: str):
        self.get_calls.append(user_id)
        if self.on_get:
            self.on_get()
        if self.fail_get:
            raise RuntimeError("clerk down")
        return SimpleNamespace(
            first_name="길동", last_name="홍", primary_email_address_id="idn_2",
            email_addresses=[SimpleNamespace(id="idn_1", email_address="other@example.com"),
                             SimpleNamespace(id="idn_2", email_address=f"{user_id}@example.com")])

    def _delete(self, *, user_id: str):
        if self.fail_delete:
            raise RuntimeError("clerk down")
        self.deleted.append(user_id)


@pytest.fixture
def fake_clerk():
    return FakeClerk()


@pytest.fixture
def client():
    return TestClient(create_app())


@pytest.fixture
def client_with_error_route():
    app = create_app()

    @app.get("/api/v1/_test/error")
    def _raise():
        raise ApiError(404, "NOT_FOUND", "찾을 수 없습니다.")

    return TestClient(app)


@pytest.fixture
def client_with_int_route():
    app = create_app()

    @app.get("/api/v1/_test/items")
    def _items(limit: int = 10):
        return {"limit": limit}

    return TestClient(app)


@pytest.fixture(scope="session")
def _migrated():
    # 마이그레이션 자체도 테스트 DB에 적용해 검증한다.
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture
def db(_migrated):
    """테스트마다 바깥 트랜잭션을 열고 끝에 롤백한다. commit()은 savepoint만 해제한다."""
    from sqlalchemy.orm import Session

    from app.db import engine

    with engine.connect() as conn:
        outer = conn.begin()
        session = Session(conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
        try:
            yield session
        finally:
            session.close()
            outer.rollback()


@pytest.fixture
def user(db):
    from app.models import User

    u = User(clerk_user_id="user_test_1", email="a@example.com", name="테스터")
    db.add(u)
    db.flush()
    return u


@pytest.fixture
def product(db):
    from app.models import Product

    p = Product(slug="t-1", name="테스트 상품", description="설명", price=100000,
                specs={"k": "v"}, image_url="", active=True)
    db.add(p)
    db.flush()
    return p


@pytest.fixture
def storage():
    import boto3
    from moto import mock_aws

    from app.storage import Storage

    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="test-bucket")
        yield Storage(bucket="test-bucket", region="us-east-1", endpoint_url=None,
                      access_key_id="testing", secret_access_key="testing")
