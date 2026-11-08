"""도표 페이지의 관련 법규·판례에서 사실(법령명, 조, 제목, 법원, 날짜, 사건번호)만 모아 data/fault_charts.json에 넣는다.
조문 본문, 판결 요지, 협회 해설은 저장하지 않는다.
실행: cd apps/api && uv run python scripts/collect_legal.py
이미 모은 값의 표기만 다시 맞추기(네트워크 없음): uv run python scripts/collect_legal.py --normalize
"""
import html
import json
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.report import CaseRef, LawRef  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "data" / "fault_charts.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
LAW = re.compile(r"^(\S+(?: 시행령| 시행규칙)?)\s+(제\d+조(?:의\d+)?)\s*\(([^)]*)\)")
CASE = re.compile(r"^(\S+(?: \S+)?)\s+(\d{4})\.?\s*(\d{1,2})\.?\s*(\d{1,2})\.?\s*선고\s*(\d{2,4}[가-힣A-Za-z]+\d+)")  # 사건번호만(뒤에 붙은 판결·결정·쉼표는 버린다)
UNMATCHED: list[str] = []


def court_name(court: str) -> str:
    """지원 표기를 띄어 쓴다: "서울지방법원북부지원" → "서울지방법원 북부지원"."""
    return re.sub(r"법원(?=\S+지원$)", "법원 ", court)


def normalize(charts: list[dict]) -> list[dict]:
    for c in charts:
        for case in c.get("cases", []):
            case["court"] = court_name(case["court"])
    return charts


def parse(page: str, source: str) -> tuple[list[LawRef], list[CaseRef]]:
    page = re.sub(r"<(script|style).*?</\1>", "", page, flags=re.S | re.I)
    lines = [" ".join(ln.split()) for ln in html.unescape(re.sub(r"<[^>]+>", "\n", page)).split("\n")]
    laws: dict[tuple[str, str], LawRef] = {}
    cases: dict[str, CaseRef] = {}
    mode = None
    for line in lines:
        if mode == "case" and "선고" in line and not CASE.match(line) and len(line) < 80:
            UNMATCHED.append(line)  # 제목 줄처럼 짧은 것만 센다. 본문 문장은 건너뛴다.
        if line == "관련 법규":
            mode = "law"
        elif line == "판례·조정사례":
            mode = "case"
        elif mode == "law" and (m := LAW.match(line)):
            name, article, title = m.groups()
            laws.setdefault((name, article), LawRef(
                name=name, article=article, title=title, url=f"https://www.law.go.kr/법령/{name}/{article}"))
        elif mode == "case" and (m := CASE.match(line)):
            court, y, mo, d, number = m.groups()
            cases.setdefault(number, CaseRef(
                court=court_name(court), date=f"{y}.{int(mo)}.{int(d)}.", number=number,
                url=f"https://www.law.go.kr/판례/({number})" if court == "대법원" else source))
    return list(laws.values()), list(cases.values())


def main() -> None:
    charts = json.loads(OUT.read_text(encoding="utf-8"))
    if "--normalize" in sys.argv:
        OUT.write_text(json.dumps(normalize(charts), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return
    failed = []
    with httpx.Client(headers={"User-Agent": UA}, timeout=30, follow_redirects=True) as http:
        for i, c in enumerate(charts):
            if i:
                time.sleep(2)
            try:
                r = http.get(c["source"])
                r.raise_for_status()
                laws, cases = parse(r.text, c["source"])
            except Exception as e:  # 실패한 도표는 빈 목록으로 두고 알린다.
                print(f"{c['id']}: 실패 {e}")
                failed.append(c["id"])
                laws, cases = [], []
            c["laws"] = [x.model_dump() for x in laws]
            c["cases"] = [x.model_dump() for x in cases]
            print(f"{c['id']}: 법규 {len(laws)} 판례 {len(cases)}")
    OUT.write_text(json.dumps(charts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("실패:", failed or "없음")
    print(f"경고: 판례처럼 보이나 형식이 맞지 않아 건너뛴 줄 {len(UNMATCHED)}개", *UNMATCHED, sep="\n")


if __name__ == "__main__":
    main()
