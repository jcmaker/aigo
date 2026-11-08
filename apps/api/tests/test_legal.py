import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from collect_legal import court_name, normalize, parse  # noqa: E402

from app.report import FaultAssessment  # noqa: E402

HTML = """<div>관련 법규</div><div>도로교통법 제19조(안전거리 확보 등) ③ 모든 차의 운전자는 ...</div>
<div>도로교통법 제14조(차로의 설치 등) ⑤ ...</div><div>판례·조정사례</div>
<div>대법원 1986.12 9. 선고 86다카1551 판결 모든 차는 ...</div><div>서울중앙지방법원 2018.5.29 선고 2017나12345 판결 ...</div>"""


def test_parse_laws_and_cases():
    laws, cases = parse(HTML, "https://accident.knia.or.kr/x")
    assert [(x.name, x.article, x.title) for x in laws] == [
        ("도로교통법", "제19조", "안전거리 확보 등"), ("도로교통법", "제14조", "차로의 설치 등")]
    assert laws[0].url == "https://www.law.go.kr/법령/도로교통법/제19조"
    assert cases[0].court == "대법원" and cases[0].number == "86다카1551" and cases[0].date == "1986.12.9."
    assert cases[0].url == "https://www.law.go.kr/판례/(86다카1551)"
    assert cases[1].court == "서울중앙지방법원" and cases[1].url == "https://accident.knia.or.kr/x"


def test_court_branch_spacing():
    assert court_name("서울지방법원북부지원") == "서울지방법원 북부지원"
    assert court_name("서울지방법원 북부지원") == "서울지방법원 북부지원"
    assert court_name("서울중앙지방법원") == "서울중앙지방법원" and court_name("대법원") == "대법원"
    _, cases = parse("<div>판례·조정사례</div><div>서울지방법원북부지원 1999.1.2. 선고 98가단1 판결</div>", "s")
    assert cases[0].court == "서울지방법원 북부지원"
    charts = [{"cases": [{"court": "대전지방법원홍성지원"}, {"court": "대법원"}]}, {"id": "x"}]
    assert normalize(charts)[0]["cases"] == [{"court": "대전지방법원 홍성지원"}, {"court": "대법원"}]


def test_parse_article_with_branch_number():
    laws, _ = parse("<div>관련 법규</div><div>도로교통법 제156조의2(벌칙) ...</div>", "s")
    assert laws[0].article == "제156조의2"


def test_parse_space_before_title():
    laws, _ = parse("<div>관련 법규</div><strong>도로교통법 제19조 (안전거리 확보 등)</strong>", "s")
    assert (laws[0].article, laws[0].title) == ("제19조", "안전거리 확보 등")


def case_numbers(line: str):
    _, cases = parse(f"<div>판례·조정사례</div><strong>{line}</strong>", "s")
    return [(c.court, c.number, c.url) for c in cases]


def test_case_number_without_space_before_verdict():
    assert case_numbers("대법원 1995. 8. 22. 선고 95다39359판결") == [
        ("대법원", "95다39359", "https://www.law.go.kr/판례/(95다39359)")]


def test_case_number_with_trailing_comma():
    assert case_numbers("서울중앙지방법원 2012. 1. 5. 선고 2011가단34087, 2011가단40000 판결") == [
        ("서울중앙지방법원", "2011가단34087", "s")]


def test_case_number_decision():
    assert case_numbers("대법원 2020. 3. 1. 선고 2019마1234 결정") == [
        ("대법원", "2019마1234", "https://www.law.go.kr/판례/(2019마1234)")]


def test_court_name_with_branch():
    assert case_numbers("서울지방법원 북부지원 1993. 8. 2. 선고 92가단2008 판결 (차16-1)") == [
        ("서울지방법원 북부지원", "92가단2008", "s")]


def test_parse_missing_sections_returns_empty():
    assert parse("<div>내용 없음</div>", "s") == ([], [])


def test_parse_dedupes_same_article():
    laws, _ = parse(HTML + "<div>관련 법규</div><div>도로교통법 제19조(안전거리 확보 등)</div>", "s")
    assert sum(x.article == "제19조" for x in laws) == 1


def test_old_report_without_laws_loads():
    f = FaultAssessment.model_validate({
        "chart_id": "차43-2", "chart_title": "t", "source_url": "u", "me": "A", "base": 30,
        "my_min": 30, "my_max": 30, "steps": [], "unknown": []})
    assert f.laws == [] and f.cases == []
