import json
import logging
import signal
import tempfile
import threading
import time
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import quota
from app.db import SessionLocal
from app.fault import FaultTable
from app.llm import LLM
from app.models import Analysis, AnalysisStatus, Stage
from app.pipeline.run import PIPELINE_VERSION, Context, PipelineError, PipelineResult, run_pipeline
from app.push import notify_analysis
from app.storage import Storage

log = logging.getLogger("worker")
STALE_AFTER = timedelta(minutes=10)
MAX_ATTEMPTS = 2
HEARTBEAT_S = 30
INTERNAL_MESSAGE = "분석 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요."


def _live(db: Session, analysis_id: int, attempt: int | None = None) -> Analysis | None:
    """행을 잠가 가져온다. 삭제됐거나, 처리 중이 아니거나, 다른 시도가 가져갔으면 None(쓰기 금지)."""
    q = select(Analysis).where(Analysis.id == analysis_id, Analysis.deleted_at.is_(None),
                               Analysis.status == AnalysisStatus.processing)
    if attempt is not None:
        q = q.where(Analysis.attempts == attempt)
    a = db.scalar(q.with_for_update().execution_options(populate_existing=True))
    if not a:
        db.rollback()
    return a


def _gone(db: Session, analysis_id: int) -> bool:
    """삭제됐거나 행이 없다. 새 시도가 가져간 것과 구분하려고 쓴다."""
    row = db.execute(select(Analysis.id, Analysis.deleted_at).where(Analysis.id == analysis_id)).one_or_none()
    db.rollback()
    return row is None or row.deleted_at is not None


def beat(db: Session, analysis_id: int, attempt: int) -> None:
    db.execute(update(Analysis).where(
        Analysis.id == analysis_id, Analysis.attempts == attempt, Analysis.status == AnalysisStatus.processing,
        Analysis.deleted_at.is_(None)).values(heartbeat_at=quota._now()))
    db.commit()


def _heartbeat_loop(session_factory, analysis_id: int, attempt: int, stop: threading.Event, interval: float) -> None:
    while not stop.wait(interval):
        try:
            with session_factory() as db:
                beat(db, analysis_id, attempt)
        except Exception:
            log.exception("heartbeat 실패 %s", analysis_id)


def claim_next(db: Session) -> Analysis | None:
    a = db.scalar(select(Analysis).where(Analysis.status == AnalysisStatus.queued, Analysis.deleted_at.is_(None))
                  .order_by(Analysis.id).limit(1).with_for_update(skip_locked=True))
    if not a:
        db.rollback()
        return None
    now = quota._now()
    a.status, a.attempts, a.started_at, a.heartbeat_at = AnalysisStatus.processing, a.attempts + 1, now, now
    db.commit()
    return a


def requeue_stale(db: Session, now: datetime) -> int:
    rows = db.scalars(select(Analysis).where(
        Analysis.status == AnalysisStatus.processing, Analysis.deleted_at.is_(None),
        Analysis.heartbeat_at < now - STALE_AFTER).with_for_update(skip_locked=True)).all()
    final = []
    for a in rows:
        if a.attempts < MAX_ATTEMPTS:
            a.status, a.stage, a.progress = AnalysisStatus.queued, None, {}
        else:
            a.status, a.error_code, a.finished_at = AnalysisStatus.failed, "WORKER_TIMEOUT", now
            a.progress = {**(a.progress or {}), "error": {"message": "분석 시간이 너무 오래 걸렸습니다. 다시 올려 주세요."}}
            final.append((a.user_id, a.id))
    db.commit()
    for user_id, aid in final:  # 재시도로 넘어간 건 보내지 않는다.
        notify_analysis(db, user_id, aid, False)
    return len(rows)


def set_stage(db: Session, analysis_id: int, stage: str, detail: dict | None, status: str = "done",
              attempt: int | None = None) -> None:
    a = _live(db, analysis_id, attempt)
    if not a:
        return
    now = quota._now()
    a.progress = {**(a.progress or {}), stage: {"status": status, "detail": detail, "at": now.isoformat()}}
    a.stage, a.heartbeat_at = Stage(stage), now
    db.commit()


def _fail(db: Session, analysis_id: int, attempt: int, code: str, message: str, trace: dict | None = None) -> None:
    a = _live(db, analysis_id, attempt)
    if not a:
        return
    a.status, a.error_code, a.finished_at, a.trace = AnalysisStatus.failed, code, quota._now(), trace
    # 사용자 메시지는 progress["error"]에 둔다. API의 단계 목록은 Stage 키만 읽으므로 섞이지 않는다.
    a.progress = {**(a.progress or {}), "error": {"message": message}}
    user_id = a.user_id
    db.commit()
    notify_analysis(db, user_id, analysis_id, False)  # 재시도 경로가 없는 최종 실패다.


def _finish(db: Session, storage: Storage, aid: int, attempt: int, res: PipelineResult, workdir: Path) -> None:
    prefix = f"analyses/{aid}"
    overlay = workdir / "overlay.json"
    overlay.write_text(json.dumps(res.overlay, ensure_ascii=False))
    if not _live(db, aid, attempt):  # 이미 삭제됐거나 새 시도가 가져갔다. 올리지 않는다.
        if _gone(db, aid):
            storage.delete_analysis_files(aid)
        return
    db.rollback()
    storage.upload(res.playback_path, f"{prefix}/playback.mp4", "video/mp4")
    storage.upload(overlay, f"{prefix}/overlay.json", "application/json")
    a = _live(db, aid, attempt)
    if not a:
        # 업로드 중 삭제됐으면 올린 파일을 지운다. 새 시도가 가져갔으면 그 시도의 파일이므로 건드리지 않는다.
        # ponytail: 확인과 업로드 사이 틈이 남는다. 시도별 키 접두사로 막을 수 있다.
        if _gone(db, aid):
            storage.delete_analysis_files(aid)
        return
    a.playback_key, a.report, a.trace = f"{prefix}/playback.mp4", res.report.model_dump(mode="json"), res.trace
    a.pipeline_version, a.status, a.finished_at = PIPELINE_VERSION, AnalysisStatus.done, quota._now()
    user_id = a.user_id
    db.commit()
    notify_analysis(db, user_id, aid, True)


def process(db: Session, a: Analysis, storage: Storage, pipeline: Callable = run_pipeline,
            llm=None, table=None, session_factory=SessionLocal, heartbeat_s: float = HEARTBEAT_S) -> None:
    aid, attempt = a.id, a.attempts
    llm = llm or LLM()
    stop = threading.Event()
    threading.Thread(target=_heartbeat_loop, args=(session_factory, aid, attempt, stop, heartbeat_s),
                     daemon=True).start()
    try:
        # 서명 URL은 재사용될 수 있어 claim 뒤에 크기를 다시 확인한다.
        if storage.head(a.source_key) != a.source_size:
            return _fail(db, aid, attempt, "UPLOAD_CHANGED", "업로드한 영상이 바뀌었습니다. 다시 올려 주세요.")
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            storage.download(a.source_key, workdir / f"source{PurePosixPath(a.source_key).suffix}")
            ctx = Context(aid, workdir, storage, llm, table or FaultTable.load(), lambda stage, detail=None, status="done":
                          set_stage(db, aid, stage, detail, status, attempt),
                          (a.trim_start, a.trim_end) if a.trim_start is not None else None)
            _finish(db, storage, aid, attempt, pipeline(ctx), workdir)
    except PipelineError as e:
        db.rollback()
        _fail(db, aid, attempt, e.code, e.message, {"llm_calls": llm.calls})  # 실패해도 쓴 비용은 남긴다.
    except Exception:
        log.exception("분석 %s 처리 실패", aid)
        db.rollback()
        _fail(db, aid, attempt, "INTERNAL_ERROR", INTERNAL_MESSAGE, {"llm_calls": llm.calls})
    finally:
        stop.set()


def main() -> None:
    stop = False

    def _stop(*_):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    storage, last_sweep = Storage.from_settings(), 0.0
    while not stop:
        try:
            with SessionLocal() as db:
                if time.monotonic() - last_sweep >= 60:
                    requeue_stale(db, quota._now())
                    last_sweep = time.monotonic()
                a = claim_next(db)
                if a:
                    process(db, a, storage)
                    continue
        except Exception:
            log.exception("worker 루프 오류")  # DB 일시 장애로 죽지 않는다.
        time.sleep(2)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
