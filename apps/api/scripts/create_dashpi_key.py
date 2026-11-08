"""DashPi가 AIGO에 사고 클립을 올릴 때 쓰는 Clerk API Key를 만든다.

사용: cd apps/api && uv run python scripts/create_dashpi_key.py <AIGO 로그인 이메일>
CLERK_SECRET_KEY(.env)의 Clerk 인스턴스에 만든다. 키는 이번에 한 번만 보이므로 바로 Pi의
~/.config/dashpi/aigo.env 에 DASHPI_AIGO_API_KEY= 로 넣는다.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from clerk_backend_api import Clerk  # noqa: E402

from app.config import settings  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("사용: create_dashpi_key.py <이메일>")
    clerk = Clerk(bearer_auth=settings.clerk_secret_key)
    users = clerk.users.list(request={"email_address": [sys.argv[1]]})
    if len(users) != 1:
        sys.exit(f"이메일로 사용자를 하나로 찾지 못했습니다: {len(users)}명")
    key = clerk.api_keys.create_api_key(name="DashPi", subject=users[0].id)
    print(key.secret)


if __name__ == "__main__":
    main()
