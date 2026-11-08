import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_db
from app.errors import ApiError
from app.models import Order, OrderStatus, Product, User
from app.toss import TossClient, TossError, get_toss

router = APIRouter()
_RETRY_MSG = "결제 확인에 실패했습니다. 잠시 뒤 다시 시도해 주세요."


class OrderIn(BaseModel):
    product_slug: str
    quantity: int = Field(ge=1, le=5)
    recipient_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=30)
    address: str = Field(min_length=1, max_length=190)
    address_detail: str = Field(default="", max_length=100)


class ConfirmIn(BaseModel):
    payment_key: str = Field(min_length=1, max_length=200)
    amount: int


class OrderOut(BaseModel):
    id: int
    toss_order_id: str
    status: Literal["pending", "paid", "failed"]
    amount: int
    order_name: str
    product_name: str
    unit_price: int
    quantity: int
    recipient_name: str
    phone: str
    address: str
    created_at: datetime
    paid_at: datetime | None


class OrderList(BaseModel):
    items: list[OrderOut]
    total: int


def _out(o: Order) -> dict:
    return {
        "id": o.id, "toss_order_id": o.toss_order_id, "status": o.status.value, "amount": o.amount,
        "order_name": o.product_name + (f" {o.quantity}개" if o.quantity > 1 else ""),
        "product_name": o.product_name, "unit_price": o.unit_price, "quantity": o.quantity,
        "recipient_name": o.recipient_name, "phone": o.phone, "address": o.address,
        "created_at": o.created_at, "paid_at": o.paid_at,
    }


def _mine(db: Session, user: User, order_id: int, lock: bool = False) -> Order:
    q = select(Order).where(Order.id == order_id, Order.user_id == user.id)
    o = db.scalar(q.with_for_update() if lock else q)
    if not o:
        raise ApiError(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.")
    return o


@router.post("/orders", status_code=201, response_model=OrderOut)
def create_order(body: OrderIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.slug == body.product_slug, Product.active.is_(True)))
    if not p:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.")
    o = Order(
        toss_order_id="dashpi_" + uuid.uuid4().hex, idempotency_key=str(uuid.uuid4()),
        user_id=user.id, product_id=p.id, product_name=p.name, unit_price=p.price,
        quantity=body.quantity, amount=p.price * body.quantity, status=OrderStatus.pending,
        recipient_name=body.recipient_name, phone=body.phone,
        address=f"{body.address} {body.address_detail}".strip(),
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return _out(o)


@router.post("/orders/{order_id}/confirm", response_model=OrderOut)
def confirm_order(order_id: int, body: ConfirmIn, user: User = Depends(current_user),
                  db: Session = Depends(get_db), toss: TossClient = Depends(get_toss)):
    # 행 잠금을 토스 호출(타임아웃 30초) 동안 쥐어 같은 주문의 중복 승인을 직렬화한다.
    o = _mine(db, user, order_id, lock=True)
    if body.amount != o.amount:
        db.rollback()
        raise ApiError(409, "ORDER_AMOUNT_MISMATCH", "주문 금액과 결제 금액이 다릅니다.")
    if o.status == OrderStatus.paid:
        if body.payment_key != o.payment_key:
            db.rollback()
            raise ApiError(409, "ORDER_PAYMENT_MISMATCH", "이미 다른 결제로 완료된 주문입니다.")
        db.rollback()
        return _out(o)
    if o.status != OrderStatus.pending:
        db.rollback()
        raise ApiError(409, "ORDER_NOT_PAYABLE", "결제할 수 없는 주문입니다.")
    try:
        try:
            payment = toss.confirm(body.payment_key, o.toss_order_id, o.amount, o.idempotency_key)
        except TossError as e:
            if e.code != "ALREADY_PROCESSED_PAYMENT":
                raise
            # 승인은 됐는데 응답을 놓친 재시도다. 토스에 실제 결제 상태를 물어 확인한다.
            payment = toss.get_payment(body.payment_key)
    except TossError as e:
        if e.retryable:
            db.rollback()
            raise ApiError(502, "PAYMENT_RETRY", _RETRY_MSG) from e
        o.status = OrderStatus.failed
        db.commit()
        raise ApiError(402, "PAYMENT_REJECTED", e.message) from e
    if not (payment.get("status") == "DONE" and payment.get("orderId") == o.toss_order_id
            and payment.get("totalAmount") == o.amount):
        db.rollback()
        raise ApiError(502, "PAYMENT_RETRY", _RETRY_MSG)
    o.status, o.payment_key, o.paid_at = OrderStatus.paid, body.payment_key, datetime.now(UTC)
    db.commit()
    return _out(o)


@router.get("/orders", response_model=OrderList)
def list_orders(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    mine = Order.user_id == user.id
    rows = db.scalars(select(Order).where(mine).order_by(Order.id.desc()).limit(limit).offset(offset))
    return {"items": [_out(o) for o in rows], "total": db.scalar(select(func.count()).where(mine).select_from(Order))}


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(_mine(db, user, order_id))
