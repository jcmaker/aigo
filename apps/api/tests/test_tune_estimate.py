import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from tune_estimate import evaluate, weight_grid

N = 60  # 12초, 0.2초 간격


def _spike(at: float, v: float = 1.0) -> list[float]:
    return [v if i == round(at / 0.2) else 0.0 for i in range(N)]


def _row(file, is_accident, collision_t, raw, tracks=3, split="tuned"):
    return {"file": file, "split": split, "is_accident": is_accident, "collision_t": collision_t,
            "tracks": tracks, "series": {"raw": raw}}


W = {"box": 0.4, "motion": 0.3, "audio": 0.1, "decel": 0.2}
S = {"motion": 0.6, "audio": 0.6, "decel": 0.6}


def test_counts_estimates_by_split():
    shake_sound = {"motion": _spike(5.0), "audio": _spike(5.0), "box": _spike(0), "decel": _spike(0)}
    rows = [_row("hit", True, 5.0, shake_sound),
            _row("late", True, 8.0, shake_sound),  # 추정은 되지만 정답과 3초 차이
            _row("calm", False, None, {"motion": _spike(5.0), "box": _spike(0), "decel": _spike(0)}, split="t8_only"),
            _row("unknown", None, None, shake_sound),
            _row("no_tracks", True, 5.0, shake_sound, tracks=0)]
    got = evaluate(rows, W, 0.3, S)
    t = got["tuned"]
    assert (t["acc"], t["acc_est"], t["acc_est_1s"], t["acc_cand_1s"]) == (3, 2, 1, 2)
    assert t["undecided_est"] == ["unknown"]
    assert (got["t8_only"]["noacc"], got["t8_only"]["noacc_est"], got["t8_only"]["noacc_cand"]) == (1, 0, 1)
    assert got["all"]["acc"] == 3


def test_threshold_above_signal_blocks_estimate():
    rows = [_row("hit", True, 5.0, {"motion": _spike(5.0, 0.7), "audio": _spike(5.0, 0.7), "box": _spike(0), "decel": _spike(0)})]
    assert evaluate(rows, W, 0.25, S)["all"]["acc_est"] == 1  # 점수 0.28
    assert evaluate(rows, W, 0.25, dict.fromkeys(S, 0.75))["all"]["acc_est"] == 0


def test_weight_grid_is_round_and_sums_to_one():
    g = weight_grid()
    assert all(abs(sum(w.values()) - 1) < 1e-9 and min(w.values()) >= 0.1 for w in g)
    assert {"box": 0.4, "motion": 0.3, "audio": 0.1, "decel": 0.2} in g
