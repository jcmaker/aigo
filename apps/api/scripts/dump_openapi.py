"""FastAPI 스키마를 apps/web/openapi.json으로 쓴다.

apps/api/.env를 읽지 않도록 apps/web에서 실행한다.
  cd apps/web && TOSS_SECRET_KEY=test_x DATABASE_URL=postgresql:///dashpi_test \
    uv run --project ../api python ../api/scripts/dump_openapi.py
"""

import json
import sys
from pathlib import Path

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))

from app.main import create_app  # noqa: E402

out = API.parent / "web" / "openapi.json"
out.write_text(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n")
