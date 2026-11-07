import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.auth import get_clerk
from app.db import get_db
from app.main import create_app
from app.models import PushDevice, User
from app.storage import get_storage
from tests.conftest import issue_token

TOKEN = "ExponentPushToken[abc123]"


@pytest.fixture
def client(db, storage, fake_clerk):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_clerk] = lambda: fake_clerk
    app.dependency_overrides[get_storage] = lambda: storage
    return TestClient(app)


def auth(sub):
    return {"Authorization": f"Bearer {issue_token(sub, f'{sub}@example.com')}"}


def owner(db, token=TOKEN):
    return db.scalar(select(User.clerk_user_id).join(PushDevice, PushDevice.user_id == User.id)
                     .where(PushDevice.token == token))


def test_register_moves_token_to_current_user(client, db):
    body = {"token": TOKEN, "platform": "android"}
    assert client.post("/api/v1/devices", json=body, headers=auth("user_a")).status_code == 204
    assert owner(db) == "user_a"
    assert client.post("/api/v1/devices", json={**body, "platform": "ios"}, headers=auth("user_b")).status_code == 204
    assert owner(db) == "user_b"
    assert db.scalars(select(PushDevice)).all()[0].platform == "ios"


@pytest.mark.parametrize("token,platform", [
    ("not-a-token", "android"), ("ExpoPushToken[]", "android"), ("ExpoPushToken[" + "x" * 250 + "]", "android"),
    (TOKEN, "web"), ("", "ios"), (TOKEN + "\n", "android"),
])
def test_register_rejects_bad_token(client, token, platform):
    r = client.post("/api/v1/devices", json={"token": token, "platform": platform}, headers=auth("user_a"))
    assert r.status_code == 400 and r.json()["code"] == "INVALID_PUSH_TOKEN" and r.json()["message"]


def test_delete_only_removes_own_token(client, db):
    client.post("/api/v1/devices", json={"token": TOKEN, "platform": "ios"}, headers=auth("user_a"))
    assert client.delete("/api/v1/devices", params={"token": TOKEN}, headers=auth("user_b")).status_code == 204
    assert owner(db) == "user_a"
    assert client.delete("/api/v1/devices", params={"token": TOKEN}, headers=auth("user_a")).status_code == 204
    assert owner(db) is None
    # 없는 토큰도 204
    assert client.delete("/api/v1/devices", params={"token": TOKEN}, headers=auth("user_a")).status_code == 204


def test_device_rows_go_with_user(db, user):
    db.add(PushDevice(token=TOKEN, user_id=user.id, platform="ios"))
    db.flush()
    db.execute(delete(User).where(User.id == user.id))
    assert db.scalar(select(PushDevice).where(PushDevice.token == TOKEN)) is None
