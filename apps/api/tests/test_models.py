import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Analysis, AnalysisStatus, Order, OrderStatus, Product, Stage, User
from app.seed import seed


def _order(product, user, toss_id="ORD-1", key="idem-1"):
    return Order(
        toss_order_id=toss_id, idempotency_key=key, user_id=user.id, product_id=product.id,
        product_name=product.name, unit_price=product.price, quantity=2,
        amount=product.price * 2, recipient_name="홍길동", phone="010-0000-0000",
        address="경기도 시흥시",
    )


def test_order_snapshot_survives_product_change(db, product, user):
    o = _order(product, user)
    db.add(o)
    db.flush()
    product.name = "바뀐 이름"
    product.price = 1
    db.flush()
    db.expire_all()
    o = db.get(Order, o.id)
    assert (o.product_name, o.unit_price, o.amount) == ("테스트 상품", 100000, 200000)
    assert o.status == OrderStatus.pending


def test_user_clerk_id_unique(db):
    db.add(User(clerk_user_id="dup", email="a@example.com", name="a"))
    db.flush()
    db.add(User(clerk_user_id="dup", email="b@example.com", name="b"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_toss_order_id_unique(db, product, user):
    db.add(_order(product, user, "SAME", "k1"))
    db.flush()
    db.add(_order(product, user, "SAME", "k2"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_order_user_nullable(db, product, user):
    o = _order(product, user)
    o.user_id = None
    db.add(o)
    db.flush()
    assert o.user_id is None


def test_analysis_defaults(db, user):
    a = Analysis(user_id=user.id)
    db.add(a)
    db.flush()
    assert a.status == AnalysisStatus.created
    assert a.attempts == 0
    assert a.progress == {}
    assert a.created_at is not None
    assert [s.value for s in Stage] == ["normalize", "scan", "locate", "focus", "observe", "assess"]


def test_seed_is_idempotent(db):
    seed(db)
    seed(db)
    assert db.query(Product).count() == 2
    assert {p.slug for p in db.query(Product)} == {"dashpi-standard", "dashpi-pro"}
