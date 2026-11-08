import requests

from app.storage import Storage


def test_storage_round_trip(storage, tmp_path):
    assert storage.head("missing/key") is None
    src = tmp_path / "a.mp4"
    src.write_bytes(b"hello")
    storage.upload(src, "analyses/1/source.mp4", "video/mp4")
    assert storage.head("analyses/1/source.mp4") == 5
    dst = tmp_path / "b.mp4"
    storage.download("analyses/1/source.mp4", dst)
    assert dst.read_bytes() == b"hello"


def test_presign_put_and_get(storage):
    url = storage.presign_put("analyses/2/source.mp4", "video/mp4")
    # moto는 requests 호출만 가로챈다.
    requests.put(url, data=b"xyz", headers={"Content-Type": "video/mp4"}).raise_for_status()
    assert storage.head("analyses/2/source.mp4") == 3
    assert requests.get(storage.presign_get("analyses/2/source.mp4")).content == b"xyz"


def test_delete_prefix(storage, tmp_path):
    f = tmp_path / "f"
    f.write_bytes(b"1")
    for k in ("analyses/3/a", "analyses/3/b", "analyses/30/a"):
        storage.upload(f, k, "application/octet-stream")
    storage.delete_prefix("analyses/3/")
    assert storage.head("analyses/3/a") is None
    assert storage.head("analyses/3/b") is None
    assert storage.head("analyses/30/a") == 1


def test_addressing_style_sets_presigned_host():
    """Railway Bucket은 virtual-host 주소에서만 CORS 규칙을 적용한다."""
    args = ("bucket", "auto", "https://s3.example.dev", "k", "s")
    assert Storage(*args, addressing_style="virtual").presign_put("x", "video/mp4").startswith("https://bucket.s3.example.dev/x")
    assert Storage(*args).presign_put("x", "video/mp4").startswith("https://s3.example.dev/bucket/x")
