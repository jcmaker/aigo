from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import ApiError
from app.models import Analysis, AnalysisStatus, User

KST = ZoneInfo("Asia/Seoul")


def _now() -> datetime:
    return datetime.now(UTC)


def reserve_analysis(db: Session, user: User, now: datetime) -> None:
    """하루(한국 시간) 한도를 확인한다. 같은 날 확인을 직렬화하려고 트랜잭션 advisory lock을 건다.
    삭제 표시된 행도 센다(지웠다 다시 만들어 한도를 우회하지 못하게). 잠금은 호출자의 commit/rollback까지 유지되므로, 호출자는 확인 직후 같은 트랜잭션에서 행을 만들고 commit해야 한다."""
    today = now.astimezone(KST).date()
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": today.toordinal()})
    start = datetime.combine(today, datetime.min.time(), tzinfo=KST)
    day = (Analysis.created_at >= start, Analysis.created_at < start + timedelta(days=1))
    count = lambda *extra: db.scalar(select(func.count()).select_from(Analysis).where(*day, *extra))  # noqa: E731
    if count() >= settings.global_daily_limit:
        raise ApiError(429, "SERVICE_LIMIT", "오늘 서비스 전체 분석 한도에 도달했습니다. 내일 다시 이용해 주세요.")
    # 전체 한도는 비용 상한이라 실패도 센다(실패해도 OpenAI 비용이 나간다). 사용자 한도는 실패를 돌려준다.
    if count(Analysis.user_id == user.id, Analysis.status != AnalysisStatus.failed) >= settings.user_daily_limit:
        raise ApiError(429, "DAILY_LIMIT", f"하루 분석 한도({settings.user_daily_limit}건)를 모두 사용했습니다.")
