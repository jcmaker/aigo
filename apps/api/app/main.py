from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import install_error_handlers
from app.routes import analyses, devices, me, orders, products


def create_app() -> FastAPI:
    app = FastAPI(title="AIGO API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.clerk_authorized_parties,  # 토큰을 믿는 웹 주소와 같은 목록
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    @app.get("/api/v1/health")
    def health():
        return {"status": "ok"}

    app.include_router(me.router, prefix="/api/v1")
    app.include_router(devices.router, prefix="/api/v1")
    app.include_router(products.router, prefix="/api/v1")
    app.include_router(analyses.router, prefix="/api/v1")
    app.include_router(orders.router, prefix="/api/v1")
    return app
