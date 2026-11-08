from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings


class Storage:
    """S3 호환 저장소(Railway Bucket, MinIO). Railway Bucket은 virtual-host 주소에서만 CORS 규칙을 적용한다."""

    def __init__(self, bucket: str, region: str, endpoint_url: str | None,
                 access_key_id: str, secret_access_key: str, addressing_style: str = "path"):
        self.bucket = bucket
        self.s3 = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key_id or None,
            aws_secret_access_key=secret_access_key or None,
            config=Config(signature_version="s3v4", s3={"addressing_style": addressing_style}),
        )

    @classmethod
    def from_settings(cls) -> "Storage":
        s = settings
        return cls(s.s3_bucket, s.s3_region, s.s3_endpoint_url, s.s3_access_key_id, s.s3_secret_access_key,
                   s.s3_addressing_style)

    def presign_put(self, key: str, content_type: str, expires_s: int = 900) -> str:
        return self.s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires_s,
        )

    def presign_get(self, key: str, expires_s: int = 3600) -> str:
        return self.s3.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=expires_s
        )

    def head(self, key: str) -> int | None:
        try:
            return self.s3.head_object(Bucket=self.bucket, Key=key)["ContentLength"]
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return None
            raise

    def download(self, key: str, path: str | Path) -> None:
        self.s3.download_file(self.bucket, key, str(path))

    def upload(self, path: str | Path, key: str, content_type: str) -> None:
        self.s3.upload_file(str(path), self.bucket, key, ExtraArgs={"ContentType": content_type})

    def delete_prefix(self, prefix: str) -> None:
        for page in self.s3.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix):
            objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if objs:
                self.s3.delete_objects(Bucket=self.bucket, Delete={"Objects": objs})

    def delete_analysis_files(self, analysis_id: int) -> None:
        """분석 하나의 모든 파일(원본, 재생본, 오버레이)을 지운다."""
        self.delete_prefix(f"analyses/{analysis_id}/")


def get_storage() -> Storage:
    """FastAPI 의존성. 테스트에서는 dependency_overrides로 바꾼다."""
    return Storage.from_settings()
