"""후보 JSON(candidate_check.py 결과)으로 WEIGHTS, MIN_SCORE, STRONG을 오프라인으로 훑는다. LLM은 부르지 않는다.

초안 정답 기준이다. --split 분할에서 고르고, 같은 값을 다른 분할에도 적용해 함께 적는다.
조건(전 분할): 무사고 영상 추정 0, 사고 영상 후보 1초 이내 MIN_RECALL 이상, 무사고 영상 중 후보가 생기는 수 NOACC_CAND_MAX 이하.
그 안에서 조정 분할의 1초 이내 추정 최대 → 시각이 틀린 추정(1초 밖) 최소 → 후보 1초 이내 최대
→ 현재 가중치·MIN_SCORE에 가까운 값 → STRONG이 낮은 값(같은 결과면 검출을 넓게).
실행: cd apps/api && uv run python scripts/tune_estimate.py --candidates eval/results/<시각>-candidates.json --split tuned \\
      --out eval/results/<시각>-tuning.md
"""
import argparse
import itertools
import json
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL", "postgresql:///dashpi_test")  # 설정이 요구하지만 쓰지 않는다.

from app.pipeline import estimate, locate

NEAR_S = 1.0
MIN_RECALL = 16  # Task 2(decel 추가) 전 수준: 사고 영상 18개 중 후보 1초 이내 16개
NOACC_CAND_MAX = 4  # Task 2 전 수준: 무사고 7개 중 후보가 생긴 영상 4개(관찰 단계가 거른다)
GRID = [round(0.4 + 0.05 * i, 2) for i in range(11)]  # STRONG 0.4~0.9
MIN_SCORES = [0.25, 0.3, 0.35]
SIGNALS = ("box", "motion", "audio", "decel")


def weight_grid() -> list[dict[str, float]]:
    """0.1 간격, 합 1, 각 0.1 이상. 둥근 값만 본다(과적합 방지)."""
    out = []
    for b, m, a in itertools.product(range(1, 8), repeat=3):
        d = 10 - b - m - a
        if d >= 1:
            out.append(dict(zip(SIGNALS, (b / 10, m / 10, a / 10, d / 10))))
    return out


@contextmanager
def settings(weights: dict, min_score: float, strong: dict):
    with mock.patch.dict(locate.WEIGHTS, weights), mock.patch.object(locate, "MIN_SCORE", min_score), \
            mock.patch.dict(estimate.STRONG, strong):
        yield


def run_row(row: dict) -> tuple[list, estimate.Estimate | None]:
    """현재 설정으로 후보를 다시 고르고 run.py처럼 추적이 없으면 추정하지 않는다."""
    cands = locate.pick_candidates(row["series"]["raw"])
    return cands, (estimate.estimate_collision(cands) if row["tracks"] else None)


def tally(rows: list[dict], results: list[tuple[list, estimate.Estimate | None]]) -> dict[str, dict]:
    """분할별(그리고 all) 집계. 미정 영상에서 추정이 켜지면 목록으로 남긴다."""
    out: dict[str, dict] = {}
    for row, (cands, est) in zip(rows, results):
        for split in (row["split"], "all"):
            s = out.setdefault(split, {"acc": 0, "acc_est": 0, "acc_est_1s": 0, "acc_cand_1s": 0,
                                       "noacc": 0, "noacc_est": 0, "noacc_cand": 0, "undecided_est": []})
            t = row["collision_t"]
            if row["is_accident"] is True:
                s["acc"] += 1
                s["acc_cand_1s"] += any(abs(c.t - t) <= NEAR_S for c in cands)
                s["acc_est"] += est is not None
                s["acc_est_1s"] += est is not None and abs(est.t - t) <= NEAR_S
            elif row["is_accident"] is False:
                s["noacc"] += 1
                s["noacc_est"] += est is not None
                s["noacc_cand"] += bool(cands)
            elif est is not None:
                s["undecided_est"].append(row["file"])
    return out


def evaluate(rows: list[dict], weights: dict, min_score: float, strong: dict) -> dict[str, dict]:
    with settings(weights, min_score, strong):
        return tally(rows, [run_row(r) for r in rows])


def key(r: dict, split: str, current: dict, current_min: float) -> tuple:
    a, s = r["result"]["all"], r["result"].get(split, {})
    ok = a["noacc_est"] == 0 and a["acc_cand_1s"] >= MIN_RECALL and a["noacc_cand"] <= NOACC_CAND_MAX
    return (ok, s.get("acc_est_1s", 0), -(s.get("acc_est", 0) - s.get("acc_est_1s", 0)), a["acc_cand_1s"],
            -round(sum(abs(r["weights"][k] - current[k]) for k in SIGNALS) + abs(r["min_score"] - current_min), 6),
            -r["strong"]["motion"])


def search(rows: list[dict], split: str) -> tuple[dict, list[dict]]:
    """신호별로 따로 훑지 않고 STRONG을 세 신호 같은 값으로 둔다. 조정 분할 사고 6개로는 따로 정할 근거가 없다."""
    current = dict(locate.WEIGHTS)
    grid = [{"weights": w, "min_score": m, "strong": dict.fromkeys(estimate.STRONG, g)}
            for w in weight_grid() + [current] for m in MIN_SCORES for g in GRID]
    for r in grid:
        r["result"] = evaluate(rows, r["weights"], r["min_score"], r["strong"])
    return max(grid, key=lambda r: key(r, split, current, locate.MIN_SCORE)), grid


def render(rows: list[dict], chosen: dict, coarse: list[dict], split: str, baseline: dict) -> str:
    cols = "| 분할 | 사고 | 사고 추정 | 추정 1초 이내 | 사고 후보 1초 이내 | 무사고 | 무사고 추정 | 무사고 후보 있음 |"

    def table(res: dict) -> list[str]:
        out = [cols, "|---|---|---|---|---|---|---|---|"]
        for sp in ("tuned", "t8_only", "held_out", "all"):
            s = res.get(sp)
            if s:
                out.append(f"| {sp} | {s['acc']} | {s['acc_est']} | {s['acc_est_1s']} | {s['acc_cand_1s']} "
                           f"| {s['noacc']} | {s['noacc_est']} | {s['noacc_cand']} |")
        return out

    fmt = lambda d: ", ".join(f"{k} {v}" for k, v in d.items())
    lines = ["# 충돌 추정 임계값 조정", "", "**초안 정답 기준.** LLM은 부르지 않았다. 후보 JSON의 원래 신호 배열로 후보와 추정을 다시 계산했다.",
             f"조정 분할: `{split}`. 같은 값을 다른 분할에 그대로 적용했다.", "",
             "## 고른 값", "", f"- WEIGHTS: {fmt(chosen['weights'])}", f"- MIN_SCORE: {chosen['min_score']}",
             f"- STRONG: {fmt(chosen['strong'])}", "", *table(chosen["result"]), "",
             f"미정 영상 중 추정이 켜진 영상: {', '.join(chosen['result']['all']['undecided_est']) or '없음'}", "",
             "## 현재 값(조정 전)", "", (f"- WEIGHTS: {fmt(baseline['weights'])}, MIN_SCORE {baseline['min_score']}, "
             f"STRONG: {fmt(baseline['strong'])}"), "", *table(baseline["result"]), "",
             f"미정 영상 중 추정이 켜진 영상: {', '.join(baseline['result']['all']['undecided_est']) or '없음'}", "",
             "## 고른 가중치·MIN_SCORE에서 균일 STRONG별 결과", "",
             "| STRONG | " + " | ".join(f"{sp} 추정/1초/무사고추정" for sp in ("tuned", "t8_only", "held_out")) + " | 미정 추정 |",
             "|---|---|---|---|---|"]
    for r in coarse:
        if r["weights"] == chosen["weights"] and r["min_score"] == chosen["min_score"]:
            res = r["result"]
            cells = [f"{res[sp]['acc_est']}/{res[sp]['acc_est_1s']}/{res[sp]['noacc_est']}" if sp in res else "-"
                     for sp in ("tuned", "t8_only", "held_out")]
            lines.append(f"| {r['strong']['motion']} | " + " | ".join(cells) + f" | {len(res['all']['undecided_est'])} |")
    lines += ["", "## 영상별(고른 값)", "", "| 파일 | 분할 | 정답 | 정답 충돌 | 후보(초) | 추정(초) |", "|---|---|---|---|---|---|"]
    with settings(chosen["weights"], chosen["min_score"], chosen["strong"]):
        for row in rows:
            cands, est = run_row(row)
            label = {True: "사고", False: "무사고", None: "미정"}[row["is_accident"]]
            lines.append(f"| {row['file'][:12]} | {row['split']} | {label} | {row['collision_t'] if row['collision_t'] is not None else '-'} "
                         f"| {' '.join(str(c.t) for c in cands) or '-'} | {est.t if est else '-'} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", type=Path, required=True)
    ap.add_argument("--split", default="tuned")
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    rows = [r for r in json.loads(a.candidates.read_text(encoding="utf-8")) if r.get("series", {}).get("raw")]
    baseline = {"weights": dict(locate.WEIGHTS), "min_score": locate.MIN_SCORE, "strong": dict(estimate.STRONG)}
    baseline["result"] = evaluate(rows, **{k: baseline[k] for k in ("weights", "min_score", "strong")})
    chosen, coarse = search(rows, a.split)
    a.out.write_text(render(rows, chosen, coarse, a.split, baseline), encoding="utf-8")
    a.out.with_suffix(".json").write_text(json.dumps({"split": a.split, "chosen": chosen, "baseline": baseline},
                                                     ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(a.out)


if __name__ == "__main__":
    main()
