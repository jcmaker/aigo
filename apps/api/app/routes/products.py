from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import Product

router = APIRouter()


class ProductOut(BaseModel):
    slug: str
    name: str
    description: str
    price: int
    specs: dict[str, Any]
    image_url: str | None


class ProductList(BaseModel):
    items: list[ProductOut]
    total: int


def _out(p: Product) -> dict:
    return {"slug": p.slug, "name": p.name, "description": p.description, "price": p.price,
            "specs": p.specs, "image_url": p.image_url}


@router.get("/products", response_model=ProductList)
def list_products(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db)):
    active = Product.active.is_(True)
    rows = db.scalars(select(Product).where(active).order_by(Product.id).limit(limit).offset(offset))
    return {"items": [_out(p) for p in rows], "total": db.scalar(select(func.count()).where(active).select_from(Product))}


@router.get("/products/{slug}", response_model=ProductOut)
def get_product(slug: str, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.slug == slug, Product.active.is_(True)))
    if not p:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.")
    return _out(p)
