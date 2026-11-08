FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.11.14 /uv /usr/local/bin/uv
WORKDIR /app
# uv.lock 기준으로 설치한다. Linux torch는 pyproject의 [tool.uv.sources]에 따라 CPU 전용이다.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
ENV PATH="/app/.venv/bin:$PATH"
# YOLO 가중치(git 제외)를 빌드 때 이미지에 넣는다. 경로는 settings.yolo_weights 기본값과 같다.
RUN python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY data ./data
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
