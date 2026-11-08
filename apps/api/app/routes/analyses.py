import math
from datetime import datetime, timedelta
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import quota
from app.auth import Uploader, current_uploader, current_user
from app.config import settings
from app.db import get_db
from app.errors import ApiError
from app.models import Analysis, AnalysisStatus, Stage, User
from app.report import Report
from app.storage import Storage, get_storage

router = APIRouter()
UPLOAD_TTL_S = 900
MIN_TRIM_S = 1
CONTENT_TYPES = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".avi": "video/x-msvideo"}


class AnalysisIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=1)
    content_type: str = Field(default="", max_length=100)  # 참고용. 실제 값은 확장자로 정한다.
    consent: bool
    trim_start: float | None = None  # 초. trim_end와 함께 보내거나 둘 다 생략한다.
    trim_end: float | None = None


class StageOut(BaseModel):
    stage: str
    status: str
    detail: dict | None
    at: str | None


class AnalysisError(BaseModel):
    code: str
    message: str


class AnalysisOut(BaseModel):
    id: int
    source: str
    status: str
    stage: str | None
    progress: list[StageOut]
    report: Report | None
    playback_url: str | None
    overlay_url: str | None
    error: AnalysisError | None
    created_at: datetime


class AnalysisList(BaseModel):
    items: list[AnalysisOut]
    total: int


class UploadTicket(BaseModel):
    id: int
    upload_url: str
    upload_headers: dict[str, str]
    expires_at: datetime


def _mine(db: Session, user: User, analysis_id: int, lock: bool = False) -> Analysis:
    q = select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == user.id,
                                    Analysis.deleted_at.is_(None))
    a = db.scalar(q.with_for_update() if lock else q)
    if not a:
        raise ApiError(404, "ANALYSIS_NOT_FOUND", "분석을 찾을 수 없습니다.")
    return a


def _progress(a: Analysis) -> list[dict]:
    # progress는 {단계: {status, detail, at}} 형태로 가정한다. 단계 순서대로 내보낸다.
    p = a.progress or {}
    return [{"stage": s.value, "status": p[s.value].get("status", "done"),
             "detail": p[s.value].get("detail"), "at": p[s.value].get("at")} for s in Stage if s.value in p]


def _out(a: Analysis, storage: Storage) -> dict:
    done = a.status == AnalysisStatus.done
    return {
        "id": a.id, "source": a.source, "status": a.status.value, "stage": a.stage.value if a.stage else None,
        "progress": _progress(a),
        "report": a.report if done else None,
        "playback_url": storage.presign_get(a.playback_key) if done and a.playback_key else None,
        "overlay_url": storage.presign_get(f"analyses/{a.id}/overlay.json") if done else None,
        "error": ({"code": a.error_code or "ANALYSIS_FAILED", "message": (a.progress or {}).get("error", {}).get("message")
                                                        or "분석에 실패했습니다. 영상을 다시 올려 주세요."}
                  if a.status == AnalysisStatus.failed else None),
        "created_at": a.created_at,
    }


def _check_trim(start: float | None, end: float | None) -> None:
    if start is None and end is None:
        return
    if start is None or end is None or not (math.isfinite(start) and math.isfinite(end)):
        raise ApiError(400, "INVALID_TRIM", "구간의 시작과 끝을 모두 올바른 숫자로 보내 주세요.")
    if not 0 <= start < end:
        raise ApiError(400, "INVALID_TRIM", "구간의 끝은 시작보다 뒤여야 합니다.")
    if end - start < MIN_TRIM_S:
        raise ApiError(400, "INVALID_TRIM", f"구간은 {MIN_TRIM_S}초 이상이어야 합니다.")
    if end - start > settings.max_video_seconds:
        raise ApiError(400, "INVALID_TRIM", f"구간은 {settings.max_video_seconds}초 이하여야 합니다.")


@router.post("/analyses", status_code=201, response_model=UploadTicket)
def create_analysis(body: AnalysisIn, uploader: Uploader = Depends(current_uploader), db: Session = Depends(get_db),
                    storage: Storage = Depends(get_storage)):
    user = uploader.user
    if not body.consent:
        raise ApiError(400, "CONSENT_REQUIRED", "영상 분석에 동의해야 업로드할 수 있습니다.")
    _check_trim(body.trim_start, body.trim_end)
    ext = PurePosixPath(body.filename).suffix.lower()
    if ext not in CONTENT_TYPES:
        raise ApiError(400, "UNSUPPORTED_VIDEO", "mp4, mov, webm, avi 영상만 올릴 수 있습니다.")
    if body.size > settings.max_video_bytes:
        raise ApiError(400, "VIDEO_TOO_LARGE", f"영상은 {settings.max_video_bytes // 1024 // 1024}MB 이하여야 합니다.")
    try:
        now = quota._now()
        quota.reserve_analysis(db, user, now)
        a = Analysis(user_id=user.id, source=uploader.source, created_at=now, consent_at=now, source_size=body.size,
                     trim_start=body.trim_start, trim_end=body.trim_end)
        db.add(a)
        db.flush()
        a.source_key = f"analyses/{a.id}/source{ext}"
        db.commit()  # 한도 확인과 행 생성을 한 트랜잭션으로 묶고 잠금을 푼다.
    except Exception:
        db.rollback()
        raise
    headers = {"Content-Type": CONTENT_TYPES[ext]}
    return {"id": a.id, "upload_url": storage.presign_put(a.source_key, headers["Content-Type"], UPLOAD_TTL_S),
            "upload_headers": headers, "expires_at": now + timedelta(seconds=UPLOAD_TTL_S)}


@router.post("/analyses/{analysis_id}/submit", response_model=AnalysisOut)
def submit_analysis(analysis_id: int, uploader: Uploader = Depends(current_uploader), db: Session = Depends(get_db),
                    storage: Storage = Depends(get_storage)):
    a = _mine(db, uploader.user, analysis_id, lock=True)
    if a.status == AnalysisStatus.created:
        if storage.head(a.source_key) != a.source_size:
            db.rollback()
            raise ApiError(409, "UPLOAD_INCOMPLETE", "영상 업로드가 끝나지 않았습니다. 다시 올려 주세요.")
        a.status = AnalysisStatus.queued
        db.commit()
    else:
        db.rollback()  # 이미 제출됨: 그대로 현재 상태를 돌려준다.
    return _out(a, storage)


@router.get("/analyses", response_model=AnalysisList)
def list_analyses(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                  user: User = Depends(current_user), db: Session = Depends(get_db),
                  storage: Storage = Depends(get_storage)):
    mine = (Analysis.user_id == user.id) & Analysis.deleted_at.is_(None)
    rows = db.scalars(select(Analysis).where(mine).order_by(Analysis.id.desc()).limit(limit).offset(offset))
    return {"items": [_out(a, storage) for a in rows],
            "total": db.scalar(select(func.count()).where(mine).select_from(Analysis))}


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def get_analysis(analysis_id: int, user: User = Depends(current_user), db: Session = Depends(get_db),
                 storage: Storage = Depends(get_storage)):
    return _out(_mine(db, user, analysis_id), storage)


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: int, user: User = Depends(current_user), db: Session = Depends(get_db),
                    storage: Storage = Depends(get_storage)):
    a = _mine(db, user, analysis_id)
    storage.delete_analysis_files(a.id)
    a.erase(quota._now())  # 행은 남겨 하루 한도에 계속 센다.
    db.commit()
    return Response(status_code=204)
