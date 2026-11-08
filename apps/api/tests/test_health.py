import pytest
from pydantic import ValidationError

from app.config import Settings


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_api_error_shape(client_with_error_route):
    r = client_with_error_route.get("/api/v1/_test/error")
    assert r.status_code == 404
    assert r.json() == {"code": "NOT_FOUND", "message": "찾을 수 없습니다."}


def test_validation_error_shape(client_with_int_route):
    r = client_with_int_route.get("/api/v1/_test/items?limit=abc")
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"


def test_unknown_route_uses_error_shape(client):
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


def test_cors_only_web_origin(client):
    ok = client.get("/api/v1/health", headers={"Origin": "http://localhost:3000"})
    bad = client.get("/api/v1/health", headers={"Origin": "http://evil.example"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in bad.headers


def test_non_test_toss_key_rejected():
    with pytest.raises(ValidationError):
        Settings(database_url="x", toss_secret_key="live_sk_real")


def test_cors_allows_every_configured_web_origin(monkeypatch):
    from fastapi.testclient import TestClient

    from app.config import settings
    from app.main import create_app

    monkeypatch.setattr(settings, "clerk_authorized_parties", ["https://a.example", "https://b.example"])
    client = TestClient(create_app())
    for origin in ("https://a.example", "https://b.example"):
        r = client.get("/api/v1/health", headers={"Origin": origin})
        assert r.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-origin" not in client.get("/api/v1/health", headers={"Origin": "https://evil.example"}).headers
