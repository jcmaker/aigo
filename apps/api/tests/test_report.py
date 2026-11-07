import pytest

from app.report import Report, confidence


@pytest.mark.parametrize("found, evidence, unknown, want", [
    (True, 3, 1, "high"),
    (True, 5, 0, "high"),
    (True, 2, 0, "medium"),
    (True, 3, 2, "medium"),
    (False, 9, 0, "low"),  # 충돌이 확인되지 않으면 근거가 많아도 낮음이다.
])
def test_confidence_rules(found, evidence, unknown, want):
    assert confidence(found, evidence, unknown) == want


def test_report_requires_every_field():
    with pytest.raises(ValueError):
        Report(involvement="none")
