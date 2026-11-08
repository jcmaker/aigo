import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

DATA = Path(__file__).resolve().parent.parent / "data" / "products.json"


def seed(db: Session) -> None:
    """slug 기준으로 넣거나 갱신한다. 여러 번 실행해도 결과가 같다."""
    from app.models import Product

    for item in json.loads(DATA.read_text(encoding="utf-8")):
        p = db.scalar(select(Product).where(Product.slug == item["slug"]))
        if p is None:
            db.add(Product(**item))
        else:
            for k, v in item.items():
                setattr(p, k, v)
    db.commit()


if __name__ == "__main__":
    from app.db import SessionLocal

    with SessionLocal() as session:
        seed(session)
