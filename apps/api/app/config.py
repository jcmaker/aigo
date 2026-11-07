from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    s3_endpoint_url: str = ""
    s3_bucket: str = "dashpi-videos"
    s3_region: str = "auto"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_addressing_style: str = "path"  # Railway Bucket은 virtual, 로컬 moto와 MinIO는 path
    clerk_secret_key: str = ""
    clerk_jwt_key: str = ""
    web_origin: str = "http://localhost:3000"
    # CORS와 Clerk 토큰이 함께 쓰는 웹 주소 목록. 비워 두면 web_origin 하나만 허용한다. 환경변수는 JSON 배열로 쓴다.
    clerk_authorized_parties: list[str] = []
    toss_secret_key: str
    openai_api_key: str = ""
    openai_model: str = "gpt-5.5"
    openai_reasoning_effort: str = "low"
    max_video_bytes: int = 209715200
    max_video_seconds: int = 120
    yolo_imgsz: int = 960  # 1080p 영상에서 640보다 탐지가 1.3배 많고 1280과는 비슷하다.
    yolo_conf: float = 0.15
    yolo_weights: str = "yolo11n.pt"  # 없으면 ultralytics가 내려받는다. Docker는 빌드 때 넣는다.
    user_daily_limit: int = 5
    global_daily_limit: int = 100

    @model_validator(mode="after")
    def _default_parties(self):
        if not self.clerk_authorized_parties:
            self.clerk_authorized_parties = [self.web_origin]
        return self

    @field_validator("toss_secret_key")
    @classmethod
    def _toss_test_key_only(cls, v: str) -> str:
        if not v.startswith("test_"):
            raise ValueError("토스 키는 test_ 로 시작해야 합니다 (실결제 키 금지).")
        return v


settings = Settings()
