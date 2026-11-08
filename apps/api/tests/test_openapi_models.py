from app.main import create_app


def test_web_types_come_from_response_models():
    """웹이 api.gen.ts를 쓰려면 이 응답들에 스키마가 있어야 한다."""
    paths = create_app().openapi()["paths"]

    def ref(path: str, method: str, status: str) -> str:
        return paths[path][method]["responses"][status]["content"]["application/json"]["schema"]["$ref"].split("/")[-1]

    assert ref("/api/v1/analyses", "post", "201") == "UploadTicket"
    assert ref("/api/v1/products", "get", "200") == "ProductList"
    assert ref("/api/v1/products/{slug}", "get", "200") == "ProductOut"
    assert ref("/api/v1/orders", "post", "201") == "OrderOut"
    assert ref("/api/v1/orders", "get", "200") == "OrderList"
    assert ref("/api/v1/orders/{order_id}", "get", "200") == "OrderOut"
    assert ref("/api/v1/orders/{order_id}/confirm", "post", "200") == "OrderOut"
