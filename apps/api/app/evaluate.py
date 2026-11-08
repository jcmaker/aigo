"""평가 세트로 분석 품질을 재고 eval/results/<시각>.md와 .json을 남긴다.

실행: cd apps/api && uv run python -m app.evaluate --videos <폴더> [<폴더> ...] [--model <모델>] [--draft]
다시 채점(비용 없음, 새 파일에 쓴다): uv run python -m app.evaluate --rescore eval/results/<시각>.json [<시각2>.json ...] [--draft]

평가는 DB를 쓰지 않지만 설정이 요구하므로 .env에 없으면 DATABASE_URL=postgresql:///dashpi_test를 앞에 붙인다.
합격 판정은 `checked_by`가 있는 항목으로만 낸다. --draft는 확인 전 라벨로 채점하고 판정을 내지 않는다.
"""
import argparse
import json
import random
import shutil
import tempfile
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "eval" / "golden.json"
RESULTS = ROOT / "eval" / "results"
EVIDENCE_CHECKS = ROOT / "eval" / "evidence_checks.json"

COLLISION_TOLERANCE_S = 1.0
MIN_CONFIRMED = 18
EVIDENCE_SAMPLE = 30
PASS_LINE = {"collision_ok": 0.8, "chart_ok": 0.7, "range_ok": 0.7, "evidence": 0.9}  # 설계 문서 10장
TIME_LIMIT_S = 90  # Railway 기준이다. 여기서 재는 값은 이 컴퓨터의 시간이라 판정에 쓰지 않는다.
# tuned: T8, T10 조정에 쓴 클립. t8_only: T8 후보 측정만 거치고 프롬프트 조정에는 안 쓴 클립. held_out: 어디에도 안 쓴 클립.
SPLITS = ("tuned", "t8_only", "held_out")
PRICE = {"gpt-5.5": (5.0, 30.0), "gpt-5.4": (2.5, 15.0), "gpt-5.4-mini": (0.75, 4.5)}  # 1M 토큰당 입력, 출력 달러
LABELS = {"collision_ok": "충돌 시각 1초 이내", "chart_ok": "정답 도표", "range_ok": "정답 과실이 범위 안", "adopted": "도표 채택률(낸 수/기대 수)",
          "wrong_chart": "틀린 도표 비율(틀린 수/낸 수)", "false_fault": "사고 없는 영상에 과실 표시", "false_accident": "사고 없는 영상을 사고로 판단",
          "involvement_ok": "관여 판정 일치"}


class ClipFailed(Exception):
    def __init__(self, code: str, cost: float):
        super().__init__(code)
        self.code, self.cost = code, cost


def cost(calls: list[dict], model: str) -> float:
    if model not in PRICE:
        raise SystemExit(f"{model}의 가격이 PRICE에 없어 예산을 잴 수 없습니다.")
    inp, out = PRICE[model]
    return sum(c["input_tokens"] * inp + c["output_tokens"] * out for c in calls) / 1_000_000


def select(entries: list[dict], draft: bool) -> list[dict]:
    """사고 여부가 정해지지 않은 항목은 뺀다. 초안이 아니면 사람이 확인한 항목만 남긴다."""
    return [e for e in entries if e["is_accident"] is not None and (draft or e.get("checked_by"))]


def score(e: dict, r: dict) -> dict:
    """값이 None이면 그 항목은 그 지표의 대상이 아니다. 돌리지 못한 영상은 대상 지표에서 실패로 센다."""
    ran = r["status"] == "ok"
    chart = r.get("chart_id") if ran else None
    s = dict.fromkeys(("collision_ok", "chart_ok", "range_ok", "adopted", "wrong_chart", "false_fault", "false_accident"))
    s["involvement_ok"] = r.get("involvement") == e["involvement"] if ran else False
    if e["is_accident"] is False:
        if ran:
            s["false_fault"] = chart is not None or r.get("my_min") is not None
            s["false_accident"] = r["involvement"] != "none"
        return s
    if e["collision_t"] is not None:
        t = r.get("collision_t") if ran else None
        s["collision_ok"] = t is not None and abs(t - e["collision_t"]) <= COLLISION_TOLERANCE_S
    if e["my_fault"] is not None:
        s["range_ok"] = ran and r.get("my_min") is not None and r["my_min"] <= e["my_fault"] <= r["my_max"]
    if e["involvement"] == "party" and not e["unsure"]:
        # 사고를 못 찾았으면 "도표 없음"이 정답이어도 맞힌 것이 아니다. 아무것도 안 내는 파이프라인이 점수를 받으면 안 된다.
        s["chart_ok"] = ran and r["involvement"] == "party" and chart == e["chart_id"]
        if e["chart_id"] is not None:
            s["adopted"] = chart is not None
        if chart is not None:
            s["wrong_chart"] = chart != e["chart_id"]
    return s


def metrics(pairs: list[tuple[dict, dict]]) -> dict:
    m = {}
    for key in LABELS:
        vals = [s[key] for _, s in pairs if s[key] is not None]
        m[key] = (sum(vals), len(vals))
    m["not_evaluated"] = sum(1 for e, s in pairs if e["is_accident"] is False and s["false_fault"] is None)
    m["evidence"] = None
    return m


def passed(m: dict) -> bool:
    """측정하지 못한 지표가 하나라도 있으면 합격이 아니다."""
    if m["false_fault"][0] or m["not_evaluated"] or not m["false_fault"][1] or m["evidence"] is None:
        return False
    return all(m[k][1] and m[k][0] / m[k][1] >= line for k, line in PASS_LINE.items())


def verdict(m: dict, confirmed: int, unscored: int = 0) -> str:
    if unscored:
        return f"판정 불가: 확인된 항목 중 이 실행에 없는 항목 {unscored}개"
    if confirmed < MIN_CONFIRMED:
        return f"판정 불가: 확인된 항목 {confirmed}개, 최소 {MIN_CONFIRMED}개"
    return ("합격" if passed(m) else "미달") + f" (처리 시간 {TIME_LIMIT_S}초 기준은 Railway에서 따로 잰다)"


def _frame_evidence(r: dict) -> list[dict]:
    """합격선은 프레임 근거만 센다. source가 없는 옛 행은 프레임이다."""
    return [ev for ev in r.get("evidence", []) if ev.get("source", "frame") == "frame"]


def sensor_count(rows: list[dict]) -> int:
    return sum(ev.get("source") == "sensor" for r in rows for ev in r.get("evidence", []))


def evidence_sample(rows: list[dict], n: int) -> list[dict]:
    items = [{"file": r["file"], **ev} for r in rows for ev in _frame_evidence(r)]
    return sorted(random.Random(0).sample(items, min(n, len(items))), key=lambda i: (i["file"], i["t"]))


def evidence_rate(checks: list[dict], rows: list[dict], draft: bool) -> tuple[int, int] | None:
    """이 실행의 근거를 사람이 본 결과만 센다. 다른 실행의 검사와 같은 항목의 반복은 표본이 아니다."""
    shown = {(r["file"], ev["t"]) for r in rows for ev in _frame_evidence(r)}
    used = {(c["file"], c["t"]): c["ok"] for c in checks if (draft or c.get("checked_by")) and (c["file"], c["t"]) in shown}
    return (sum(used.values()), len(used)) if len(used) >= EVIDENCE_SAMPLE else None


def load_runs(paths: list[Path]) -> tuple[dict, list[dict]]:
    """미정 클립을 따로 돌린 결과처럼 같은 설정의 실행만 합친다. 재실행으로 더 나은 결과를 골라 넣지 못하게 중복도 막는다."""
    runs = [json.loads(p.read_text(encoding="utf-8")) for p in paths]
    keys = ("model", "effort", "prompt_version")
    if len({tuple(r["meta"].get(k) for k in keys) for r in runs}) > 1:
        raise SystemExit("모델, 추론, 프롬프트가 다른 실행은 합칠 수 없습니다.")
    rows = [row for r in runs for row in r["rows"]]
    if len({r["file"] for r in rows}) < len(rows):
        raise SystemExit("같은 영상이 두 실행에 들어 있어 합칠 수 없습니다.")
    return runs[0]["meta"], rows


def run_all(entries: list[dict], dirs: list[Path], run_one: Callable[[dict, Path], dict], budget: float,
            save: Callable[[list[dict]], None]) -> list[dict]:
    rows: list[dict] = []
    spent = 0.0
    for e in entries:
        video = next((d / e["file"] for d in dirs if (d / e["file"]).exists()), None)
        if video is None:
            rows.append({"file": e["file"], "status": "missing", "cost": 0.0})
        elif spent >= budget:
            rows.append({"file": e["file"], "status": "not_run", "cost": 0.0})
        else:
            try:
                rows.append(run_one(e, video))
            except ClipFailed as f:
                rows.append({"file": e["file"], "status": "failed", "error": f.code, "cost": f.cost})
            spent += rows[-1]["cost"]
            save(rows)
    return rows


def run_clip(e: dict, video: Path) -> dict:
    from app.config import settings
    from app.errors import PipelineError
    from app.fault import FaultTable
    from app.llm import LLM
    from app.pipeline.estimate import SENSOR_TEXT
    from app.pipeline.run import Context, run_pipeline

    llm = LLM()
    started = time.perf_counter()
    with tempfile.TemporaryDirectory() as tmp:  # 영상과 프레임은 저장소에 남기지 않는다.
        work = Path(tmp)
        shutil.copy(video, work / f"source{video.suffix}")
        try:
            res = run_pipeline(Context(0, work, None, llm, FaultTable.load(), lambda *a, **k: None))
        except PipelineError as err:
            raise ClipFailed(err.code, cost(llm.calls, settings.openai_model)) from err
    rep, fault = res.report, res.report.fault
    evidence = [*rep.timeline, *(s.evidence for s in fault.steps)] if fault else list(rep.timeline)
    sensor = {(f["t"], f["text"]) for f in (res.trace.get("estimate") or {}).get("facts", [])}
    tag = lambda v: "sensor" if v.text in SENSOR_TEXT.values() and (v.t, v.text) in sensor else "frame"  # noqa: E731
    return {"file": e["file"], "status": "ok", "involvement": rep.involvement, "collision_t": rep.collision_t,
            "chart_id": fault.chart_id if fault else None, "me": fault.me if fault else None,
            "my_min": fault.my_min if fault else None, "my_max": fault.my_max if fault else None,
            "confidence": rep.confidence, "severity": rep.severity, "scene": res.trace["observation"]["scene"],
            "extra_focus": res.trace["extra_focus"], "unknown": fault.unknown if fault else [],
            "serious": [v.model_dump(exclude={"evidence"}) for v in rep.serious_violations],
            "evidence": [{"t": v.t, "text": v.text, "source": tag(v)} for v in evidence], "candidates": res.trace["candidates"], "summary": rep.summary, "reason": rep.reason,
            "seconds": round(time.perf_counter() - started, 1), "stage_seconds": res.trace["stage_seconds"],
            "calls": len(llm.calls), "cost": round(cost(llm.calls, settings.openai_model), 4)}


def _rate(v: tuple[int, int] | None) -> str:
    return "미측정" if v is None or not v[1] else f"{v[0]}/{v[1]} ({v[0] / v[1]:.0%})"


def _table(pairs: list[tuple[dict, dict]], evidence: tuple[int, int] | None = None, sensor: int = 0) -> list[str]:
    m = metrics(pairs)
    lines = ["| 지표 | 값 |", "|---|---|", *(f"| {LABELS[k]} | {_rate(m[k])} |" for k in LABELS)]
    if evidence is not None:
        lines.append(f"| 근거 시각 표본 검사 | {_rate(evidence)} |")
        lines.append(f"| 근거 시각 표본(센서) | {sensor} |")
    if m["not_evaluated"]:
        lines.append(f"| 돌리지 못한 사고 없는 영상 | {m['not_evaluated']}개 |")
    return lines


def render(entries: list[dict], rows: list[dict], checks: list[dict], meta: dict, draft: bool) -> str:
    by_file = {r["file"]: r for r in rows}
    selected = select(entries, draft)
    used = [e for e in selected if e["file"] in by_file]
    unscored = len(selected) - len(used)
    pairs = [(e, score(e, by_file[e["file"]])) for e in used]
    evidence = evidence_rate(checks, rows, draft)
    ran = [r for r in rows if r["status"] == "ok"]
    seconds = sorted(r["seconds"] for r in ran)
    lines = [f"# 품질 평가 {meta.get('at', '')}", ""]
    if draft:
        lines += ["**초안 정답 기준.** 사람이 확인하지 않은 라벨로 채점했다. 품질 판정이 아니다.", ""]
        if unscored:
            lines += [f"이 실행에 없는 항목 {unscored}개는 채점하지 않았다.", ""]
    else:
        m = metrics(pairs)
        m["evidence"] = evidence
        lines += [f"판정: {verdict(m, len(selected), unscored)}", ""]
    lines += [f"모델 {meta.get('model')}, 추론 {meta.get('effort')}, 프롬프트 {meta.get('prompt_version')}, "
              f"채점 {len(used)}개, 실행 {len(ran)}/{len(rows)}개, 비용 ${sum(r['cost'] for r in rows):.2f}", ""]
    if seconds:
        lines += [f"처리 시간(이 컴퓨터): 중앙값 {seconds[len(seconds) // 2]}초, 최대 {seconds[-1]}초. Railway 값이 아니다.", ""]
    lines += ["## 전체", "", *_table(pairs, evidence or (0, 0), sensor_count(rows)), ""]
    for split in SPLITS:
        part = [p for p in pairs if p[0]["split"] == split]
        if part:
            lines += [f"## {split} ({len(part)}개)", "", *_table(part), ""]
    lines += ["## 영상별", "", "| 파일 | 상태 | 관여(정답) | 충돌(정답) | 도표(정답) | 범위(정답) | 시간 | 비용 |", "|---|---|---|---|---|---|---|---|"]
    golden = {e["file"]: e for e in entries}
    for r in rows:
        e, rng = golden[r["file"]], f"{r.get('my_min')}~{r.get('my_max')}" if r.get("my_min") is not None else "-"
        lines.append(f"| {r['file'][:12]} | {r['status']}{' ' + r['error'] if r.get('error') else ''} "
                     f"| {r.get('involvement', '-')}({e['involvement']}) | {r.get('collision_t', '-')}({e['collision_t']}) "
                     f"| {r.get('chart_id') or '-'}({e['chart_id'] or ('미정' if e['unsure'] else '없음')}) "
                     f"| {rng}({e['my_fault']}) | {r.get('seconds', '-')} | ${r['cost']:.3f} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", nargs="+", type=Path, default=[])
    ap.add_argument("--model")
    ap.add_argument("--effort")
    ap.add_argument("--only", nargs="+", default=[], help="파일 이름 앞부분으로 고른다")
    ap.add_argument("--budget", type=float, default=12.0, help="이 금액(달러)을 넘으면 다음 영상을 돌리지 않는다")
    ap.add_argument("--draft", action="store_true")
    ap.add_argument("--rescore", nargs="+", type=Path)
    ap.add_argument("--name", default="", help="결과 파일 이름 뒤에 붙인다")
    a = ap.parse_args()
    entries = json.loads(GOLDEN.read_text(encoding="utf-8"))
    checks = json.loads(EVIDENCE_CHECKS.read_text(encoding="utf-8")) if EVIDENCE_CHECKS.exists() else []
    if a.rescore:
        meta, rows = load_runs(a.rescore)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out = a.rescore[0].with_name(f"{a.rescore[0].stem}-rescore-{stamp}.md")
        with out.open("x", encoding="utf-8") as f:  # 이전 채점 기록을 덮어쓰지 않는다.
            f.write(render(entries, rows, checks, meta, a.draft))
        print(out)
        return
    if not a.videos:
        ap.error("--videos 또는 --rescore가 필요합니다")

    from app.config import settings
    from app.llm import PROMPT_VERSION

    settings.openai_model = a.model or settings.openai_model
    settings.openai_reasoning_effort = a.effort or settings.openai_reasoning_effort
    cost([], settings.openai_model)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    meta = {"at": stamp, "model": settings.openai_model, "effort": settings.openai_reasoning_effort, "prompt_version": PROMPT_VERSION}
    base = RESULTS / (stamp + (f"-{a.name}" if a.name else ""))
    RESULTS.mkdir(parents=True, exist_ok=True)

    def save(rows: list[dict]) -> None:  # 돈을 쓴 결과를 잃지 않게 영상마다 쓴다.
        base.with_suffix(".json").write_text(json.dumps({"meta": meta, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")

    todo = [e for e in entries if not a.only or e["file"].startswith(tuple(a.only))]
    rows = run_all(todo, a.videos, run_clip, a.budget, save)
    save(rows)
    base.with_suffix(".md").write_text(render(entries, rows, checks, meta, a.draft), encoding="utf-8")
    print(base.with_suffix(".md"), f"비용 ${sum(r['cost'] for r in rows):.2f}")
    print("근거 표본:", json.dumps(evidence_sample(rows, EVIDENCE_SAMPLE), ensure_ascii=False)[:200])


if __name__ == "__main__":
    main()
