from datetime import datetime, timedelta, timezone
from pathlib import Path

import time

import pytest
from pydantic import BaseModel

from app import worker
from app.models import Analysis, AnalysisStatus
from app.pipeline.run import PipelineError, PipelineResult

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)


class Rep(BaseModel):
    verdict: str = "ok"


def mk(db, user, status=AnalysisStatus.queued, **kw):
    a = Analysis(user_id=user.id, status=status, source_size=3, **kw)
    db.add(a)
    db.flush()
    a.source_key = f"analyses/{a.id}/source.mp4"
    db.flush()
    return a


def put_source(storage, a, data=b"abc"):
    storage.s3.put_object(Bucket=storage.bucket, Key=a.source_key, Body=data)


def ok_pipeline(ctx):
    ctx.on_stage("scan", {"n": 1})
    p = ctx.workdir / "out.mp4"
    p.write_bytes(b"mp4")
    return PipelineResult(report=Rep(), trace={"t": 1}, playback_path=p, overlay={"boxes": []})


def raising(exc):
    def f(ctx):
        raise exc
    return f


def test_two_workers_claim_different_jobs(db, user):
    a, b = mk(db, user), mk(db, user)
    x, y = worker.claim_next(db), worker.claim_next(db)
    assert {x.id, y.id} == {a.id, b.id}
    assert x.status == AnalysisStatus.processing and x.attempts == 1 and x.heartbeat_at
    assert worker.claim_next(db) is None


def test_claim_skips_deleted(db, user):
    mk(db, user, deleted_at=NOW)
    assert worker.claim_next(db) is None


def test_stale_job_requeued_once(db, user):
    a = mk(db, user, status=AnalysisStatus.processing, attempts=1, stage="scan", progress={"scan": {}},
           heartbeat_at=NOW - timedelta(minutes=11))
    fresh = mk(db, user, status=AnalysisStatus.processing, attempts=1, heartbeat_at=NOW - timedelta(minutes=5))
    assert worker.requeue_stale(db, NOW) == 1
    assert a.status == AnalysisStatus.queued and a.stage is None and a.progress == {} and fresh.status == AnalysisStatus.processing


def test_stale_job_fails_second_time(db, user):
    a = mk(db, user, status=AnalysisStatus.processing, attempts=2, heartbeat_at=NOW - timedelta(minutes=11))
    worker.requeue_stale(db, NOW)
    assert a.status == AnalysisStatus.failed and a.error_code and a.finished_at


def test_stale_ignores_deleted(db, user):
    a = mk(db, user, status=AnalysisStatus.processing, attempts=1, deleted_at=NOW,
           heartbeat_at=NOW - timedelta(minutes=11))
    assert worker.requeue_stale(db, NOW) == 0 and a.status == AnalysisStatus.processing


def test_set_stage_records_progress(db, user):
    a = mk(db, user, status=AnalysisStatus.processing)
    worker.set_stage(db, a.id, "scan", {"n": 2})
    assert a.progress["scan"]["status"] == "done" and a.progress["scan"]["detail"] == {"n": 2}
    assert a.stage.value == "scan" and a.progress["scan"]["at"]


def test_pipeline_error_saves_user_message(db, user, storage):
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)
    worker.process(db, a, storage, raising(PipelineError("NO_VIDEO", "차량 영상이 아닙니다.")))
    assert a.status == AnalysisStatus.failed and a.error_code == "NO_VIDEO"
    assert a.progress["error"]["message"] == "차량 영상이 아닙니다."


def test_unexpected_error_hides_detail(db, user, storage, caplog):
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)
    worker.process(db, a, storage, raising(RuntimeError("secret-db-password")))
    assert a.error_code == "INTERNAL_ERROR" and "secret" not in str(a.progress)
    assert "secret-db-password" in caplog.text


def test_upload_changed_fails(db, user, storage):
    a = mk(db, user); put_source(storage, a, b"abcdef"); a = worker.claim_next(db)
    worker.process(db, a, storage, ok_pipeline)
    assert a.status == AnalysisStatus.failed and a.error_code == "UPLOAD_CHANGED"


def test_deleted_during_processing_is_not_recreated(db, user, storage):
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)

    def pipeline(ctx):
        r = ok_pipeline(ctx)
        a.erase(NOW)  # 처리 중 사용자가 삭제
        db.commit()
        return r

    worker.process(db, a, storage, pipeline)
    assert a.deleted_at and a.report is None and a.status == AnalysisStatus.processing
    keys = storage.s3.list_objects_v2(Bucket=storage.bucket, Prefix=f"analyses/{a.id}/").get("KeyCount")
    assert keys == 0


def test_success_uploads_outputs_and_saves_report(db, user, storage):
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)
    worker.process(db, a, storage, ok_pipeline)
    assert a.status == AnalysisStatus.done and a.report == {"verdict": "ok"} and a.trace == {"t": 1}
    assert a.playback_key == f"analyses/{a.id}/playback.mp4" and a.finished_at and a.pipeline_version
    assert storage.head(a.playback_key) == 3 and storage.head(f"analyses/{a.id}/overlay.json")


def _age(db, a):
    a.heartbeat_at = datetime.now(timezone.utc) - timedelta(minutes=11)
    db.flush()


def _requeue_and_rerun(db, a, storage):
    """첫 worker가 파이프라인 안에 있는 동안 요청이 재대기되고 두 번째 worker가 끝까지 처리한다."""
    _age(db, a)
    assert worker.requeue_stale(db, datetime.now(timezone.utc)) == 1
    a2 = worker.claim_next(db)
    assert a2.attempts == 2
    worker.process(db, a2, storage, ok_pipeline)
    assert a2.status == AnalysisStatus.done


def test_stale_worker_finish_is_dropped(db, user, storage):
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)

    def first(ctx):
        _requeue_and_rerun(db, a, storage)
        r = ok_pipeline(ctx)
        r.trace = {"t": "stale"}
        return r

    worker.process(db, a, storage, first)
    assert a.status == AnalysisStatus.done and a.trace == {"t": 1} and a.attempts == 2
    assert storage.head(a.playback_key) == 3  # 새 시도의 결과물이 남아 있다


def test_stale_worker_failure_and_stage_are_dropped(db, user, storage):
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)

    def first(ctx):
        _requeue_and_rerun(db, a, storage)
        ctx.on_stage("assess", {"stale": True})
        raise PipelineError("NO_VIDEO", "늦은 실패")

    worker.process(db, a, storage, first)
    assert a.status == AnalysisStatus.done and a.error_code is None and "assess" not in a.progress


def test_beat_keeps_long_job_from_requeue(db, user):
    a = mk(db, user); a = worker.claim_next(db)
    _age(db, a)
    worker.beat(db, a.id, 99)  # 다른 시도의 토큰은 무시된다
    db.refresh(a)
    assert worker.requeue_stale(db, datetime.now(timezone.utc)) == 1
    a = worker.claim_next(db)
    _age(db, a)
    worker.beat(db, a.id, a.attempts)
    db.refresh(a)
    assert worker.requeue_stale(db, datetime.now(timezone.utc)) == 0 and a.status == AnalysisStatus.processing


def test_heartbeat_thread_refreshes_during_pipeline(_migrated, storage):
    from sqlalchemy import delete

    from app.db import SessionLocal
    from app.models import User

    with SessionLocal() as setup:  # 스레드가 자기 세션으로 보도록 실제로 커밋한다.
        u = User(clerk_user_id="user_beat", email="b@example.com", name="b")
        setup.add(u)
        setup.flush()
        a = mk(setup, u)
        setup.commit()
        aid, uid = a.id, u.id
    put_source(storage, a)
    seen = {}

    def slow(ctx):  # on_stage를 부르지 않으므로 heartbeat_at은 스레드만 바꾼다.
        with SessionLocal() as s:
            seen["before"] = s.get(Analysis, aid).heartbeat_at
        time.sleep(0.4)
        with SessionLocal() as s:
            seen["after"] = s.get(Analysis, aid).heartbeat_at
        p = ctx.workdir / "out.mp4"
        p.write_bytes(b"mp4")
        return PipelineResult(report=Rep(), trace={}, playback_path=p, overlay={})

    try:
        with SessionLocal() as db:
            a = worker.claim_next(db)
            worker.process(db, a, storage, slow, heartbeat_s=0.05)
            assert a.status == AnalysisStatus.done
        assert seen["after"] > seen["before"]
    finally:
        with SessionLocal() as c:
            c.execute(delete(Analysis).where(Analysis.id == aid))
            c.execute(delete(User).where(User.id == uid))
            c.commit()


def test_delete_between_check_and_finish_drops_result(_migrated, storage):
    from sqlalchemy import delete

    from app.db import SessionLocal
    from app.models import User

    with SessionLocal() as setup:
        u = User(clerk_user_id="user_race", email="r@example.com", name="r")
        setup.add(u)
        setup.flush()
        a = Analysis(user_id=u.id, status=AnalysisStatus.queued, source_size=3)
        setup.add(a)
        setup.flush()
        a.source_key = f"analyses/{a.id}/source.mp4"
        setup.commit()
        aid, uid = a.id, u.id
    put_source(storage, a)

    class DeleteOnUpload:  # 업로드 중에 다른 세션이 삭제를 확정한다
        def __init__(self, inner):
            self.inner = inner

        def __getattr__(self, name):
            return getattr(self.inner, name)

        def upload(self, *args):
            self.inner.upload(*args)
            with SessionLocal() as other:
                other.get(Analysis, aid).erase(NOW)
                other.commit()

    try:
        with SessionLocal() as db:
            a = worker.claim_next(db)
            worker.process(db, a, DeleteOnUpload(storage), ok_pipeline)
        with SessionLocal() as chk:
            row = chk.get(Analysis, aid)
            assert row.deleted_at and row.report is None and row.status == AnalysisStatus.processing
        assert storage.s3.list_objects_v2(Bucket=storage.bucket, Prefix=f"analyses/{aid}/")["KeyCount"] == 0
    finally:
        with SessionLocal() as c:
            c.execute(delete(Analysis).where(Analysis.id == aid))
            c.execute(delete(User).where(User.id == uid))
            c.commit()


def test_stale_worker_cannot_write_while_newer_attempt_runs(db, user, storage):
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)

    def first(ctx):
        _age(db, a)
        worker.requeue_stale(db, datetime.now(timezone.utc))
        assert worker.claim_next(db).attempts == 2  # 새 시도가 처리 중
        ctx.on_stage("scan", {"stale": True})
        return ok_pipeline(ctx)

    worker.process(db, a, storage, first)
    assert a.status == AnalysisStatus.processing and a.attempts == 2 and a.report is None
    assert "scan" not in a.progress and storage.head(f"analyses/{a.id}/playback.mp4") is None



def test_trim_reaches_pipeline_context(db, user, storage):
    a = mk(db, user, trim_start=2.5, trim_end=9.0)
    put_source(storage, a)
    got = []

    def pipe(ctx):
        got.append(ctx.trim)
        return ok_pipeline(ctx)

    worker.process(db, worker.claim_next(db), storage, pipe)
    mk2 = mk(db, user)
    put_source(storage, mk2)
    worker.process(db, worker.claim_next(db), storage, pipe)
    assert got == [(2.5, 9.0), None]


# ---- 완료 푸시 ----
def spy(monkeypatch):
    calls = []
    monkeypatch.setattr(worker, "notify_analysis", lambda db, uid, aid, ok: calls.append((uid, aid, ok)))
    return calls


def test_worker_notifies_on_done(db, user, storage, monkeypatch):
    calls = spy(monkeypatch)
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)
    worker.process(db, a, storage, ok_pipeline)
    assert calls == [(user.id, a.id, True)]


def test_worker_notifies_on_final_failure(db, user, storage, monkeypatch):
    calls = spy(monkeypatch)
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)
    worker.process(db, a, storage, raising(PipelineError("NO_VIDEO", "x")))
    assert calls == [(user.id, a.id, False)]


def test_worker_does_not_notify_when_deleted(db, user, storage, monkeypatch):
    calls = spy(monkeypatch)
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)

    def pipeline(ctx):
        r = ok_pipeline(ctx)
        a.erase(NOW)
        db.commit()
        return r

    worker.process(db, a, storage, pipeline)
    assert calls == []


def test_notify_failure_does_not_change_analysis(db, user, storage, monkeypatch):
    from app import push
    a = mk(db, user); put_source(storage, a); a = worker.claim_next(db)
    db.add(push.PushDevice(token="ExponentPushToken[w]", user_id=user.id, platform="ios")); db.commit()

    def boom(*a, **k):
        raise RuntimeError("expo down")
    monkeypatch.setattr(push.httpx, "post", boom)  # 실제 네트워크를 쓰지 않고 실패시킨다.
    worker.process(db, a, storage, ok_pipeline)
    assert a.status == AnalysisStatus.done


def test_requeue_notifies_only_final_timeout(db, user, monkeypatch):
    calls = spy(monkeypatch)
    retry = mk(db, user, status=AnalysisStatus.processing, attempts=1, heartbeat_at=NOW - timedelta(minutes=11))
    last = mk(db, user, status=AnalysisStatus.processing, attempts=2, heartbeat_at=NOW - timedelta(minutes=11))
    worker.requeue_stale(db, NOW)
    assert retry.status == AnalysisStatus.queued
    assert calls == [(user.id, last.id, False)]
