import threading
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.auth import get_clerk
from app.config import settings
from app.db import SessionLocal, get_db
from app.main import create_app
from app.models import Analysis, AnalysisStatus, User
from app.report import Report
from app.storage import get_storage
from tests.conftest import issue_token

P = "/api/v1/analyses"
REPORT = Report(involvement="none", reason="충돌이 보이지 않습니다", accident_type=None, summary=None, collision_t=None,
                confidence="low", severity=None, timeline=[], facts=[], unseen=[], fault=None, fault_note=None,
                serious_violations=[], favorable=[], unfavorable=[], actions_now=[], actions_later=[]).model_dump()
BODY = {"filename": "a.mp4", "size": 1000, "content_type": "video/mp4", "consent": True}


def auth(sub="user_a"):
    return {"Authorization": f"Bearer {issue_token(sub, f'{sub}@example.com')}"}


@pytest.fixture
def client(db, storage, fake_clerk):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_clerk] = lambda: fake_clerk
    app.dependency_overrides[get_storage] = lambda: storage
    return TestClient(app)


@pytest.fixture
def other_auth():
    return auth("user_b")


@pytest.fixture
def frozen_time(monkeypatch):
    """quota._now를 고정하고, 시각을 바꿀 수 있는 리스트를 돌려준다."""
    from app import quota

    t = [datetime(2026, 11, 5, 10, 0, tzinfo=UTC)]  # 한국 시간 19:00
    monkeypatch.setattr(quota, "_now", lambda: t[0])
    return t


def create(client, headers=None, **kw):
    return client.post(P, json={**BODY, **kw}, headers=headers or auth())


def put(storage, a_id, n=1000, ext=".mp4"):
    storage.s3.put_object(Bucket=storage.bucket, Key=f"analyses/{a_id}/source{ext}", Body=b"x" * n)


def test_create_returns_presigned_upload(client):
    r = create(client)
    assert r.status_code == 201
    j = r.json()
    assert f"analyses/{j['id']}/source.mp4" in j["upload_url"]
    assert j["upload_headers"] == {"Content-Type": "video/mp4"}
    assert j["expires_at"]


def test_content_type_derived_from_extension(client):
    r = create(client, filename="A.MOV", content_type="x/y")
    assert r.json()["upload_headers"] == {"Content-Type": "video/quicktime"}


def test_consent_required(client):
    r = create(client, consent=False)
    assert r.status_code == 400 and r.json()["code"] == "CONSENT_REQUIRED"


def test_rejects_extension(client):
    r = create(client, filename="a.exe")
    assert r.status_code == 400 and r.json()["code"] == "UNSUPPORTED_VIDEO"


def test_rejects_size_over_limit(client):
    r = create(client, size=settings.max_video_bytes + 1)
    assert r.status_code == 400 and r.json()["code"] == "VIDEO_TOO_LARGE"


def test_user_daily_limit_uses_kst_day(client, frozen_time, monkeypatch):
    monkeypatch.setattr(settings, "user_daily_limit", 2)
    assert [create(client).status_code for _ in range(2)] == [201, 201]
    r = create(client)
    assert r.status_code == 429 and r.json()["code"] == "DAILY_LIMIT"
    # UTC로는 같은 날이지만 한국 시간으로 자정을 넘기면 새 하루다.
    frozen_time[0] = datetime(2026, 11, 5, 15, 1, tzinfo=UTC)  # KST 11/6 00:01
    assert create(client).status_code == 201


def test_failed_analysis_not_counted(client, db, monkeypatch):
    monkeypatch.setattr(settings, "user_daily_limit", 1)
    a_id = create(client).json()["id"]
    assert create(client).status_code == 429
    db.get(Analysis, a_id).status = AnalysisStatus.failed
    db.flush()
    assert create(client).status_code == 201


def test_global_daily_limit(client, db, monkeypatch, frozen_time):
    monkeypatch.setattr(settings, "global_daily_limit", 1)
    other = User(clerk_user_id="user_x")
    db.add(other)
    db.flush()
    db.add(Analysis(user_id=other.id, created_at=frozen_time[0]))
    db.flush()
    r = create(client)
    assert r.status_code == 429 and r.json()["code"] == "SERVICE_LIMIT"


def test_failed_analysis_still_counts_for_global_limit(client, db, monkeypatch, frozen_time, other_auth):
    monkeypatch.setattr(settings, "global_daily_limit", 1)
    a_id = client.post(P, json=BODY, headers=auth()).json()["id"]
    db.get(Analysis, a_id).status = AnalysisStatus.failed
    db.flush()
    r = client.post(P, json=BODY, headers=other_auth)
    assert r.status_code == 429 and r.json()["code"] == "SERVICE_LIMIT"


def test_concurrent_create_cannot_exceed_limit(fake_clerk, storage, monkeypatch):
    monkeypatch.setattr(settings, "user_daily_limit", 1)
    app = create_app()
    app.dependency_overrides[get_clerk] = lambda: fake_clerk
    app.dependency_overrides[get_storage] = lambda: storage
    c = TestClient(app)
    results = []
    try:
        ts = [threading.Thread(target=lambda: results.append(create(c, headers=auth("user_race2")).status_code))
              for _ in range(4)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        assert sorted(results) == [201, 429, 429, 429]
    finally:
        with SessionLocal() as s:
            uid = s.scalar(select(User.id).where(User.clerk_user_id == "user_race2"))
            s.execute(Analysis.__table__.delete().where(Analysis.user_id == uid))
            s.execute(User.__table__.delete().where(User.id == uid))
            s.commit()


def test_submit_without_object_409(client):
    a_id = create(client).json()["id"]
    r = client.post(f"{P}/{a_id}/submit", headers=auth())
    assert r.status_code == 409 and r.json()["code"] == "UPLOAD_INCOMPLETE"


def test_submit_size_mismatch_409(client, storage):
    a_id = create(client).json()["id"]
    put(storage, a_id, n=999)
    r = client.post(f"{P}/{a_id}/submit", headers=auth())
    assert r.status_code == 409 and r.json()["code"] == "UPLOAD_INCOMPLETE"


def test_submit_queues_and_twice_is_idempotent(client, storage, db):
    a_id = create(client).json()["id"]
    put(storage, a_id)
    for _ in range(2):
        r = client.post(f"{P}/{a_id}/submit", headers=auth())
        assert r.status_code == 200 and r.json()["status"] == "queued"
    assert db.get(Analysis, a_id).status == AnalysisStatus.queued


def test_get_shape_hides_urls_until_done(client, storage, db):
    a_id = create(client).json()["id"]
    j = client.get(f"{P}/{a_id}", headers=auth()).json()
    assert j["status"] == "created" and j["progress"] == [] and j["report"] is None
    assert j["playback_url"] is None and j["overlay_url"] is None and j["error"] is None
    a = db.get(Analysis, a_id)
    a.status, a.report = AnalysisStatus.done, REPORT
    a.playback_key = f"analyses/{a_id}/playback.mp4"
    db.flush()
    j = client.get(f"{P}/{a_id}", headers=auth()).json()
    assert j["report"] == REPORT
    assert f"analyses/{a_id}/playback.mp4" in j["playback_url"]
    assert f"analyses/{a_id}/overlay.json" in j["overlay_url"]


def test_failed_shows_error(client, db):
    a_id = create(client).json()["id"]
    a = db.get(Analysis, a_id)
    a.status, a.error_code = AnalysisStatus.failed, "NO_VIDEO"
    db.flush()
    e = client.get(f"{P}/{a_id}", headers=auth()).json()["error"]
    assert e["code"] == "NO_VIDEO" and e["message"]


def test_other_users_analysis_404(client, other_auth, storage):
    a_id = create(client).json()["id"]
    for r in (client.get(f"{P}/{a_id}", headers=other_auth),
              client.post(f"{P}/{a_id}/submit", headers=other_auth),
              client.delete(f"{P}/{a_id}", headers=other_auth)):
        assert r.status_code == 404 and r.json()["code"] == "ANALYSIS_NOT_FOUND"


def test_delete_removes_prefix(client, storage, db):
    a_id = create(client).json()["id"]
    put(storage, a_id)
    storage.s3.put_object(Bucket=storage.bucket, Key=f"analyses/{a_id}/playback.mp4", Body=b"y")
    assert client.delete(f"{P}/{a_id}", headers=auth()).status_code == 204
    assert storage.head(f"analyses/{a_id}/source.mp4") is None
    assert storage.head(f"analyses/{a_id}/playback.mp4") is None
    assert db.get(Analysis, a_id).deleted_at is not None


def test_list_returns_own_items_only(client, other_auth):
    ids = [create(client).json()["id"] for _ in range(2)]
    create(client, headers=other_auth)
    j = client.get(P, headers=auth()).json()
    assert j["total"] == 2 and [i["id"] for i in j["items"]] == ids[::-1]
    assert client.get(P + "?limit=1&offset=1", headers=auth()).json()["items"][0]["id"] == ids[0]


def test_delete_does_not_free_user_quota(client, monkeypatch):
    monkeypatch.setattr(settings, "user_daily_limit", 1)
    a_id = create(client).json()["id"]
    assert client.delete(f"{P}/{a_id}", headers=auth()).status_code == 204
    r = create(client)
    assert r.status_code == 429 and r.json()["code"] == "DAILY_LIMIT"


def test_delete_does_not_free_global_quota(client, monkeypatch, other_auth):
    monkeypatch.setattr(settings, "global_daily_limit", 1)
    a_id = create(client).json()["id"]
    assert client.delete(f"{P}/{a_id}", headers=auth()).status_code == 204
    r = create(client, headers=other_auth)
    assert r.status_code == 429 and r.json()["code"] == "SERVICE_LIMIT"


def test_withdrawal_keeps_global_count(client, db, fake_clerk, monkeypatch, other_auth):
    monkeypatch.setattr(settings, "global_daily_limit", 1)
    create(client)
    assert client.delete("/api/v1/me", headers=auth()).status_code == 204
    r = create(client, headers=other_auth)
    assert r.status_code == 429 and r.json()["code"] == "SERVICE_LIMIT"


def test_deleted_analysis_is_404_hidden_and_erased(client, storage, db):
    a_id = create(client).json()["id"]
    put(storage, a_id)
    a = db.get(Analysis, a_id)
    a.report, a.trace, a.progress, a.playback_key = {"x": 1}, {"y": 1}, {"scan": {}}, "k"
    db.flush()
    assert client.delete(f"{P}/{a_id}", headers=auth()).status_code == 204
    for r in (client.get(f"{P}/{a_id}", headers=auth()), client.post(f"{P}/{a_id}/submit", headers=auth()),
              client.delete(f"{P}/{a_id}", headers=auth())):
        assert r.status_code == 404
    j = client.get(P, headers=auth()).json()
    assert j["items"] == [] and j["total"] == 0
    db.refresh(a)
    assert a.deleted_at and a.status == AnalysisStatus.created
    assert (a.report, a.trace, a.progress, a.source_key, a.playback_key, a.source_size) == (None, None, {}, None, None, None)


def test_openapi_exposes_typed_report(client):
    spec = client.app.openapi()
    ref = spec["paths"]["/api/v1/analyses/{analysis_id}"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert ref["$ref"].endswith("/AnalysisOut")
    assert "Report" in spec["components"]["schemas"] and "FaultAssessment" in spec["components"]["schemas"]


@pytest.mark.parametrize("trim", [
    {"trim_start": 10, "trim_end": 5},
    {"trim_start": 5, "trim_end": 5},
    {"trim_start": -1, "trim_end": 5},
    {"trim_start": 0, "trim_end": 0.00001},
])
def test_create_rejects_trim_start_after_end(client, trim):
    r = create(client, **trim)
    assert r.status_code == 400 and r.json()["code"] == "INVALID_TRIM"
    assert set(r.json()) == {"code", "message"}


@pytest.mark.parametrize("trim", [{"trim_start": 1}, {"trim_end": 5}])
def test_create_rejects_only_one_trim_value(client, trim):
    r = create(client, **trim)
    assert r.status_code == 400 and r.json()["code"] == "INVALID_TRIM"


def test_create_rejects_trim_longer_than_limit(client):
    r = create(client, trim_start=0, trim_end=settings.max_video_seconds + 1)
    assert r.status_code == 400 and r.json()["code"] == "INVALID_TRIM"


def test_create_rejects_non_finite_trim(client):
    body = '{"filename":"a.mp4","size":1000,"consent":true,"trim_start":0,"trim_end":Infinity}'
    r = client.post(P, content=body, headers={**auth(), "Content-Type": "application/json"})
    assert r.status_code == 400 and r.json()["code"] == "INVALID_TRIM"
    body = body.replace("Infinity", "NaN")
    r = client.post(P, content=body, headers={**auth(), "Content-Type": "application/json"})
    assert r.status_code == 400 and r.json()["code"] == "INVALID_TRIM"


def test_create_stores_trim_and_allows_exact_limit(client, db):
    r = create(client, trim_start=30.5, trim_end=30.5 + settings.max_video_seconds)
    assert r.status_code == 201
    a = db.get(Analysis, r.json()["id"])
    assert (a.trim_start, a.trim_end) == (30.5, 30.5 + settings.max_video_seconds)
    b = db.get(Analysis, create(client).json()["id"])
    assert b.trim_start is None and b.trim_end is None
