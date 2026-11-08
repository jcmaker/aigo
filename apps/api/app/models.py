import enum
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class OrderStatus(enum.StrEnum):
    pending = "pending"
    paid = "paid"
    failed = "failed"


class AnalysisStatus(enum.StrEnum):
    created = "created"
    queued = "queued"
    processing = "processing"
    done = "done"
    failed = "failed"


class Stage(enum.StrEnum):
    normalize = "normalize"
    scan = "scan"
    locate = "locate"
    focus = "focus"
    observe = "observe"
    assess = "assess"


def _enum(e: type[enum.StrEnum], name: str) -> Enum:
    # 문자열 열로 저장해 값 추가 때 마이그레이션 부담을 줄인다.
    return Enum(e, name=name, native_enum=False, length=20, values_callable=lambda x: [m.value for m in x])


class Base(DeclarativeBase):
    pass


_now = dict(server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    clerk_user_id: Mapped[str] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(255), default="")
    name: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)


class PushDevice(Base):
    __tablename__ = "push_devices"

    token: Mapped[str] = mapped_column(String(255), primary_key=True)
    # 탈퇴하면 함께 지운다.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(10))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[int] = mapped_column(Integer)  # 원 단위
    specs: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    image_url: Mapped[str] = mapped_column(String(500), default="")
    active: Mapped[bool] = mapped_column(default=True)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    toss_order_id: Mapped[str] = mapped_column(String(64), unique=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    # 탈퇴하면 NULL로 바꿔 주문만 보관한다.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    # 주문 시점의 상품명과 단가 복사본
    product_name: Mapped[str] = mapped_column(String(100))
    unit_price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus, "order_status"), default=OrderStatus.pending)
    recipient_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(30))
    address: Mapped[str] = mapped_column(String(300))
    payment_key: Mapped[str | None] = mapped_column(String(200))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)


class Analysis(Base):
    __tablename__ = "analyses"
    __table_args__ = (
        Index("ix_analyses_status_created_at", "status", "created_at"),
        Index("ix_analyses_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # 탈퇴하면 NULL로 바꿔 한도 집계용 빈 행만 남긴다.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[AnalysisStatus] = mapped_column(
        _enum(AnalysisStatus, "analysis_status"), default=AnalysisStatus.created
    )
    stage: Mapped[Stage | None] = mapped_column(_enum(Stage, "analysis_stage"))
    # 어디서 올렸는지. 세션 토큰은 upload, DashPi API Key는 dashpi. 인증 방식으로 정한다.
    source: Mapped[str] = mapped_column(String(10), default="upload", server_default="upload")
    source_key: Mapped[str | None] = mapped_column(String(300))
    playback_key: Mapped[str | None] = mapped_column(String(300))
    source_size: Mapped[int | None] = mapped_column(BigInteger)  # 클라이언트가 알린 업로드 크기
    duration_sec: Mapped[float | None]
    trim_start: Mapped[float | None]  # 선택한 구간(초). 둘 다 있거나 둘 다 없다. 재시도해도 유지한다.
    trim_end: Mapped[float | None]
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    trace: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    progress: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    pipeline_version: Mapped[str | None] = mapped_column(String(32))
    error_code: Mapped[str | None] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)

    def erase(self, now: datetime) -> None:
        """삭제 표시를 하고 내용을 지운다. 하루 한도 집계를 위해 상태와 created_at 행은 남긴다."""
        self.deleted_at = now
        self.report = self.trace = None
        self.progress = {}
        self.source_key = self.playback_key = self.source_size = self.error_code = None
        self.trim_start = self.trim_end = None
