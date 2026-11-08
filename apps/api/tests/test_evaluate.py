import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

from app import evaluate as ev
from app.fault import FaultTable

ROOT = Path(__file__).resolve().parent.parent


def entry(**kw):
    return {"file": "a.mp4", "is_accident": True, "involvement": "party", "collision_t": 10.0, "chart_id": "차43-2",
            "me": "A", "my_fault": 30, "unsure": False, "split": "tuned", "note": None, "checked_by": "팀", **kw}


def row(**kw):
    return {"file": "a.mp4", "status": "ok", "involvement": "party", "collision_t": 10.5, "chart_id": "차43-2",
            "my_min": 20, "my_max": 40, "seconds": 30.0, "cost": 0.2, **kw}


def test_collision_within_one_second_passes():
    assert ev.score(entry(), row(collision_t=10.9))["collision_ok"] is True
    assert ev.score(entry(), row(collision_t=11.2))["collision_ok"] is False
    assert ev.score(entry(), row(collision_t=None))["collision_ok"] is False  # 놓침도 실패다.


def test_no_accident_with_fault_is_hard_failure():
    e = entry(is_accident=False, involvement="none", collision_t=None, chart_id=None, my_fault=None)
    assert ev.score(e, row())["false_fault"] is True
    assert ev.score(e, row(chart_id=None, my_min=None, my_max=None))["false_fault"] is False
    m = ev.metrics([(e, ev.score(e, row()))] + [(entry(), ev.score(entry(), row()))] * 30)
    assert m["false_fault"] == (1, 1)
    assert ev.passed(m) is False


def test_fault_range_contains_truth():
    assert ev.score(entry(my_fault=30), row())["range_ok"] is True
    assert ev.score(entry(my_fault=50), row())["range_ok"] is False
    assert ev.score(entry(my_fault=30), row(my_min=None, my_max=None, chart_id=None))["range_ok"] is False
    assert ev.score(entry(my_fault=None), row())["range_ok"] is None


def test_missing_video_is_reported_not_skipped(tmp_path):
    rows = ev.run_all([entry()], [tmp_path], lambda *_: pytest.fail("없는 영상을 돌렸다"), budget=1, save=lambda _: None)
    assert rows[0]["status"] == "missing"
    s = ev.score(entry(), rows[0])
    assert s["collision_ok"] is False and s["chart_ok"] is False and s["range_ok"] is False
    e = entry(is_accident=False, involvement="none", collision_t=None, chart_id=None, my_fault=None)
    assert ev.score(e, rows[0])["false_fault"] is None  # 안 돌린 영상을 0건으로 세면 안 된다.
    assert ev.metrics([(e, ev.score(e, rows[0]))])["not_evaluated"] == 1


def test_pipeline_failure_is_a_row_and_keeps_cost(tmp_path):
    (tmp_path / "a.mp4").write_bytes(b"x")

    def boom(*_):
        raise ev.ClipFailed("MODEL_INVALID", 0.3)

    rows = ev.run_all([entry()], [tmp_path], boom, budget=1, save=lambda _: None)
    assert (rows[0]["status"], rows[0]["error"], rows[0]["cost"]) == ("failed", "MODEL_INVALID", 0.3)


def test_budget_stops_run_and_leaves_rows(tmp_path):
    entries = [entry(file=f"{i}.mp4") for i in range(3)]
    for e in entries:
        (tmp_path / e["file"]).write_bytes(b"x")
    rows = ev.run_all(entries, [tmp_path], lambda e, _: row(file=e["file"], cost=0.6), budget=1, save=lambda _: None)
    assert [r["status"] for r in rows] == ["ok", "ok", "not_run"]


def test_results_saved_after_every_clip(tmp_path):
    (tmp_path / "a.mp4").write_bytes(b"x")
    saved = []
    ev.run_all([entry()], [tmp_path], lambda *_: row(), budget=1, save=lambda r: saved.append(len(r)))
    assert saved == [1]


def test_chart_adoption_and_wrong_chart():
    e = entry()
    m = ev.metrics([(e, ev.score(e, row())),
                    (e, ev.score(e, row(chart_id=None, my_min=None, my_max=None))),
                    (e, ev.score(e, row(chart_id="차15-1")))])
    assert m["chart_ok"] == (1, 3)
    assert m["adopted"] == (2, 3)  # 낸 도표 수 / 낼 것으로 기대한 수
    assert m["wrong_chart"] == (1, 2)  # 틀린 도표 / 낸 도표


def test_chart_on_clip_expecting_none_is_wrong():
    e = entry(chart_id=None, my_fault=None)
    assert ev.score(e, row())["wrong_chart"] is True
    assert ev.score(e, row(chart_id=None))["chart_ok"] is True


def test_unsure_chart_is_not_scored():
    e = entry(chart_id=None, my_fault=None, unsure=True, note="후보 차43-2")
    s = ev.score(e, row())
    assert s["chart_ok"] is None and s["wrong_chart"] is None and s["adopted"] is None
    assert s["collision_ok"] is True


def test_undecided_clip_is_left_out_of_every_metric():
    e = entry(is_accident=None, collision_t=None, chart_id=None, my_fault=None, unsure=True)
    assert ev.select([e], draft=True) == []


def test_unchecked_entries_excluded_from_verdict():
    assert ev.select([entry(checked_by="")], draft=False) == []
    assert len(ev.select([entry(checked_by="")], draft=True)) == 1


def test_verdict_needs_18_confirmed_entries():
    pairs = [(entry(), ev.score(entry(), row()))] * 17
    m = ev.metrics(pairs)
    m["evidence"] = (10, 10)
    assert "판정 불가" in ev.verdict(m, confirmed=17)


def test_verdict_never_passes_without_evidence_check():
    e = entry(is_accident=False, involvement="none", collision_t=None, chart_id=None, my_fault=None)
    clean = row(chart_id=None, my_min=None, my_max=None)
    m = ev.metrics([(entry(), ev.score(entry(), row()))] * 18 + [(e, ev.score(e, clean))] * 3)
    assert m["evidence"] is None
    assert ev.passed(m) is False
    m["evidence"] = (9, 10)
    assert ev.passed(m) is True


def test_draft_report_is_marked_and_claims_no_verdict():
    text = ev.render([entry(checked_by="")], [row()], [], {"model": "gpt-5.5"}, draft=True)
    assert "| 근거 시각 표본(센서) | 0 |" in text
    assert "초안 정답 기준" in text
    assert "합격" not in text.replace("합격선", "")


def test_splits_are_reported_separately():
    a, b = entry(split="tuned"), entry(file="b.mp4", split="held_out")
    text = ev.render([a, b], [row(), row(file="b.mp4", collision_t=None)], [], {"model": "gpt-5.5"}, draft=False)
    assert "held_out" in text and "tuned" in text


def test_cost_uses_tokens_and_rejects_unpriced_model():
    assert ev.cost([{"input_tokens": 1_000_000, "output_tokens": 100_000}], "gpt-5.5") == pytest.approx(8.0)
    with pytest.raises(SystemExit):
        ev.cost([], "없는-모델")


def test_evidence_sample_is_stable_and_checks_are_scored():
    rows = [row(evidence=[{"t": float(i), "text": "x"} for i in range(30)])]
    assert ev.evidence_sample(rows, 5) == ev.evidence_sample(rows, 5)
    assert len(ev.evidence_sample(rows, 5)) == 5


def evidence_run(n=ev.EVIDENCE_SAMPLE):
    rows = [row(evidence=[{"t": float(i), "text": "x"} for i in range(n)])]
    return rows, [{"file": "a.mp4", "t": float(i), "ok": i != 0, "checked_by": "팀"} for i in range(n)]


def test_evidence_rate_scores_a_full_sample():
    rows, checks = evidence_run()
    assert ev.evidence_rate(checks, rows, draft=False) == (ev.EVIDENCE_SAMPLE - 1, ev.EVIDENCE_SAMPLE)


def test_evidence_rate_has_a_floor():
    rows, checks = evidence_run(ev.EVIDENCE_SAMPLE - 1)
    assert ev.evidence_rate(checks, rows, draft=False) is None
    assert ev.evidence_rate([], rows, draft=True) is None


def test_evidence_checks_must_come_from_the_judged_run():
    rows, checks = evidence_run()
    other_run = [{**c, "t": c["t"] + 0.5} for c in checks]
    assert ev.evidence_rate(other_run, rows, draft=False) is None
    assert ev.evidence_rate([{**c, "file": "b.mp4"} for c in checks], rows, draft=False) is None


def test_repeated_evidence_checks_do_not_reach_the_floor():
    rows, checks = evidence_run()
    assert ev.evidence_rate([checks[0]] * ev.EVIDENCE_SAMPLE, rows, draft=False) is None


def test_unchecked_evidence_only_counts_in_draft():
    rows, checks = evidence_run()
    blank = [{**c, "checked_by": ""} for c in checks]
    assert ev.evidence_rate(blank, rows, draft=False) is None
    assert ev.evidence_rate(blank, rows, draft=True) == (ev.EVIDENCE_SAMPLE - 1, ev.EVIDENCE_SAMPLE)


def test_golden_file_is_consistent():
    golden = json.loads((ROOT / "eval" / "golden.json").read_text(encoding="utf-8"))
    charts = {c.id for c in FaultTable.load().charts}
    names = [e["file"] for e in golden]
    assert len(names) == len(set(names))
    for e in golden:
        assert "/" not in e["file"], e["file"]  # 파일 이름만 적는다.
        assert e["split"] in ev.SPLITS, e["file"]
        assert e["chart_id"] is None or e["chart_id"] in charts, e["file"]
        assert (e["my_fault"] is None) or (e["chart_id"] and e["me"]), e["file"]
        if e["unsure"] or e["is_accident"] is None:
            assert e["note"], e["file"]  # 불확실한 항목에는 팀이 볼 메모가 있어야 한다.
        if e["is_accident"] is False:
            assert e["collision_t"] is None and e["chart_id"] is None, e["file"]
    decided = [e for e in golden if e["is_accident"] is not None]
    assert sum(e["is_accident"] for e in decided) >= 15
    assert sum(not e["is_accident"] for e in decided) >= 3


def test_fetch_rejects_chart_with_several_cases():
    spec = importlib.util.spec_from_file_location("fetch", ROOT / "scripts" / "fetch_knia_charts.py")
    fetch = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fetch)
    page = ('<h3 class="title">차1</h3><a data-depth="3" x>t</a><dl><dt>사고 상황</dt><dd>s</dd></dl>'
            '<i data-ratio-a="30" data-ratio-b="70"></i><i data-ratio-a="80" data-ratio-b="20"></i>'
            '<ul class="factorList"><li><strong>A 가</strong><em class="isA">10</em><em class="isB">0</em></li></ul>')
    with pytest.raises(ValueError, match="여러 경우"):
        fetch.parse("차1", page)


def test_eval_videos_are_git_ignored():
    # 공개 저장소다. 루트 .gitignore의 규칙은 apps/api 아래에 적용되지 않아서 여기서 막아 둔다.
    assert subprocess.run(["git", "check-ignore", "-q", "eval/videos/x.mp4"], cwd=ROOT).returncode == 0


@pytest.mark.parametrize("status", ["missing", "failed", "not_run"])
def test_clip_that_did_not_run_earns_no_chart_credit(status):
    e = entry(chart_id=None, my_fault=None)  # "도표 없음"이 정답인 항목
    assert ev.score(e, {"file": "a.mp4", "status": status, "cost": 0.0})["chart_ok"] is False


def test_undetected_accident_earns_no_credit_for_expected_no_chart():
    e = entry(chart_id=None, my_fault=None)
    nothing = row(involvement="none", collision_t=None, chart_id=None, my_min=None, my_max=None)
    assert ev.score(e, nothing)["chart_ok"] is False
    assert ev.score(e, row(chart_id=None, my_min=None, my_max=None))["chart_ok"] is True


def judged(n):
    entries = [entry(file=f"{i}.mp4") for i in range(n)]
    entries += [entry(file=f"n{i}.mp4", is_accident=False, involvement="none", collision_t=None, chart_id=None, my_fault=None)
                for i in range(3)]
    rows = [row(file=e["file"]) if e["is_accident"] else row(file=e["file"], involvement="none", collision_t=None, chart_id=None,
                                                             my_min=None, my_max=None) for e in entries]
    rows[0]["evidence"] = [{"t": float(i), "text": "x"} for i in range(ev.EVIDENCE_SAMPLE)]
    checks = [{"file": rows[0]["file"], "t": float(i), "ok": True, "checked_by": "팀"} for i in range(ev.EVIDENCE_SAMPLE)]
    return entries, rows, checks


def test_full_run_can_reach_a_verdict():
    entries, rows, checks = judged(18)
    assert "판정: 합격" in ev.render(entries, rows, checks, {"model": "gpt-5.5"}, draft=False)


def test_verdict_refuses_a_subset_of_confirmed_entries():
    entries, rows, checks = judged(30)
    text = ev.render(entries, rows[:18] + rows[-3:], checks, {"model": "gpt-5.5"}, draft=False)
    assert "판정 불가" in text and "12개" in text
    assert "판정: 합격" not in text


def saved_run(path, rows, **meta):
    path.write_text(json.dumps({"meta": {"model": "gpt-5.5", "effort": "low", "prompt_version": "p", **meta}, "rows": rows}), encoding="utf-8")
    path.with_suffix(".md").write_text("원본", encoding="utf-8")


def test_rescore_writes_a_new_file(tmp_path, monkeypatch):
    src = tmp_path / "run.json"
    saved_run(src, [])
    monkeypatch.setattr("sys.argv", ["evaluate", "--rescore", str(src), "--draft"])
    ev.main()
    assert src.with_suffix(".md").read_text(encoding="utf-8") == "원본"
    assert len(list(tmp_path.glob("run-rescore-*.md"))) == 1


def test_rescore_merges_runs_with_the_same_settings(tmp_path, monkeypatch):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    saved_run(a, [row(file="x.mp4", involvement="party")])
    saved_run(b, [row(file="y.mp4")])
    assert [r["file"] for r in ev.load_runs([a, b])[1]] == ["x.mp4", "y.mp4"]


def test_rescore_refuses_runs_with_different_settings(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    saved_run(a, [])
    saved_run(b, [], effort="medium")
    with pytest.raises(SystemExit):
        ev.load_runs([a, b])


def test_rescore_refuses_the_same_clip_from_two_runs(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    saved_run(a, [row()])
    saved_run(b, [row()])
    with pytest.raises(SystemExit):
        ev.load_runs([a, b])


def test_committed_eval_files_hold_no_local_paths():
    for path in [*(ROOT / "eval" / "review").glob("*.md"), *(ROOT / "eval" / "results").iterdir()]:
        text = path.read_text(encoding="utf-8")
        assert "/Users/" not in text and "/private/" not in text, path.name


def test_run_clip_saves_candidates(monkeypatch):
    from types import SimpleNamespace as NS

    cands = [{"t": 1.0, "score": 0.5, "signals": {"box": 0.5}}]
    rep = NS(timeline=[], fault=None, involvement="none", collision_t=None, confidence="low", severity=None,
             summary="", reason="", serious_violations=[])
    trace = {"estimate": None, "candidates": cands, "observation": {"scene": "x"}, "extra_focus": False, "stage_seconds": {}}
    monkeypatch.setattr("app.llm.LLM", lambda: NS(calls=[]))
    monkeypatch.setattr("app.fault.FaultTable.load", classmethod(lambda cls: None))
    monkeypatch.setattr("app.pipeline.run.run_pipeline", lambda ctx: NS(report=rep, trace=trace))
    video = ROOT / "tests" / "test_evaluate.py"  # 내용은 쓰지 않는다. 복사만 된다.
    assert ev.run_clip(entry(), video)["candidates"] == cands


def test_evidence_sample_counts_frame_only():
    ev_rows = [{"t": float(i), "text": "x", "source": "frame"} for i in range(ev.EVIDENCE_SAMPLE)]
    ev_rows += [{"t": 99.0, "text": "충돌음이 크게 남", "source": "sensor"}]
    rows = [row(evidence=ev_rows)]
    checks = [{"file": "a.mp4", "t": e["t"], "ok": True, "checked_by": "팀"} for e in ev_rows]
    assert ev.evidence_rate(checks, rows, draft=False) == (ev.EVIDENCE_SAMPLE, ev.EVIDENCE_SAMPLE)
    assert all(i["source"] == "frame" for i in ev.evidence_sample(rows, 100))
    assert ev.sensor_count(rows) == 1


def test_run_clip_tags_sensor_evidence(monkeypatch):
    from types import SimpleNamespace as NS

    sensor = {"t": 3.0, "text": "화면이 크게 흔들림"}
    decel = {"t": 2.8, "text": "앞차와의 거리가 급히 좁혀진 뒤 멈춤"}
    tl = [NS(t=2.0, text="접촉"), NS(**decel), NS(t=2.9, text="앞차가 급정지함"), NS(**sensor),
          NS(t=3.0, text="화면이 크게 흔들림 같은 프레임 문장")]
    rep = NS(timeline=tl, fault=None, involvement="party", collision_t=3.0, confidence="low", severity=None,
             summary="", reason=None, serious_violations=[])
    trace = {"estimate": {"t": 2.8, "facts": [decel, sensor]}, "candidates": [], "observation": {"scene": "x"},
             "extra_focus": False, "stage_seconds": {}}
    monkeypatch.setattr("app.llm.LLM", lambda: NS(calls=[]))
    monkeypatch.setattr("app.fault.FaultTable.load", classmethod(lambda cls: None))
    monkeypatch.setattr("app.pipeline.run.run_pipeline", lambda ctx: NS(report=rep, trace=trace))
    got = ev.run_clip(entry(), ROOT / "tests" / "test_evaluate.py")["evidence"]
    assert [g["source"] for g in got] == ["frame", "sensor", "frame", "sensor", "frame"]
