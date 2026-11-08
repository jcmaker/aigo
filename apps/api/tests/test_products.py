import json

import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import create_app
from app.models import Product
from app.routes.products import ProductOut
from app.seed import DATA, seed


@pytest.fixture
def api(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=False)  # 응답 검증 실패를 500으로 본다


def test_every_seeded_product_passes_the_endpoints(api, db):
    seed(db)
    slugs = {p["slug"] for p in json.loads(DATA.read_text(encoding="utf-8"))}
    listed = api.get("/api/v1/products?limit=100")
    assert listed.status_code == 200
    assert slugs <= {p["slug"] for p in listed.json()["items"]}
    for slug in slugs:
        assert api.get(f"/api/v1/products/{slug}").status_code == 200


def test_non_string_spec_passes_the_endpoints(api, db):
    specs = {"저장": 128, "방수": True, "해상도": ["1080p", "2K"], "비고": None}
    db.add(Product(slug="odd-specs", name="이상한 사양", description="", price=1000, specs=specs))
    db.flush()
    r = api.get("/api/v1/products/odd-specs")
    assert r.status_code == 200 and r.json()["specs"] == specs
    assert api.get("/api/v1/products?limit=100").status_code == 200


def test_null_image_is_accepted():
    # 지금 컬럼은 NOT NULL이라 DB로는 만들 수 없다. 응답 모델만 확인한다.
    p = ProductOut(slug="a", name="a", description="", price=1, specs={}, image_url=None)
    assert p.image_url is None
