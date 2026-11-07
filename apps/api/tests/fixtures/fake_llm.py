class FakeLLM:
    """고정 응답을 차례로 돌려준다. 응답이 예외면 그대로 던진다."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.seen: list[tuple] = []  # (messages, schema, repair)
        self.calls: list[dict] = []

    def parse_structured(self, messages, schema, *, repair=None):
        self.seen.append((messages, schema, repair))
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        assert isinstance(r, schema)
        return r
