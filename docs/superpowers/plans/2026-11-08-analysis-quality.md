# 분석 품질 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 접촉이 보이지 않는 사고를 센서 신호로 "충돌 추정"하고, 근거 시각이 영상과 맞게 하고, 과실 판단에 법규·판례 근거를 붙인다.

**Architecture:**
- **센서 신호와 추정:** 상대 차 급정지 신호를 `pipeline/locate.py`의 후보 점수에 넣는다. 새 `pipeline/estimate.py`가 후보의 신호로 추정 여부를 정하고, `assess()`가 추정 경로로 레포트를 만든다.
- **법규·판례 데이터:** 수집 스크립트가 `data/fault_charts.json`에 법규·판례를 넣는다. 레포트 `FaultAssessment`에 선택 항목으로 실어 웹과 앱이 보인다.
- **측정:** 비용 없는 후보 분석과 오프라인 임계값 조정을 먼저 하고, 마지막에 승인을 받아 전체 재측정한다.

**Tech Stack:** Python 3.12, FastAPI, numpy, OpenCV, YOLO11n + ByteTrack, OpenAI(gpt-5.5), pytest; Next.js(web, vitest); Expo(app, jest)

**Spec:** `docs/superpowers/specs/2026-11-08-analysis-quality-design.md`

## Global Constraints

- **테스트 범위:** 에뮬레이터를 쓰지 않는다. 확인은 pytest, `app.evaluate`, 웹 vitest, 앱 jest로만 한다.
- **비용:** LLM을 부르는 전체 재측정(약 10달러)은 controller가 사용자 승인을 받은 뒤에만 한다. 그 전의 모든 작업은 로컬 계산과 재채점(`--rescore`)뿐이다.
- **결과 표기:** 정답은 초안이다. 모든 결과 문서와 표에 "초안 정답 기준"을 적는다.
- **사고 없는 영상:** 과실 표시 0건이 최우선이다. 임계값은 이 조건을 지키는 범위에서 정한다.
- **추정 방식:**
  - 대상은 `party`만이다. 흔들림(`motion`)은 필수이고, 세 단서(`audio`, `motion`, `decel`) 중 두 개 이상이 `ALIGN_S` 안에 있어야 한다.
  - 추정이면 신뢰도는 `"low"`, 요약 앞에 `"충돌 추정: "`을 붙인다.
  - 추정 `collision_t`는 신호들 중 가장 이른 시각이다.
- **센서 사실:**
  - 센서 사실은 판단 LLM에 넣지 않는다. LLM이 끝난 뒤 `timeline`에 시간순으로 붙인다.
  - 문구는 `"충돌음이 크게 남"`, `"화면이 크게 흔들림"`, `"앞차가 급정지함"`이다.
- **레포트 형식:**
  - 선택 항목만 추가한다: `FaultAssessment.laws`, `FaultAssessment.cases`, 기본값 빈 목록.
  - `laws` 항목은 `{name: str, article: str, title: str, url: str}`이다.
  - `cases` 항목은 `{court: str, date: str, number: str, url: str}`이다.
- **법규·판례 링크와 범위:**
  - 법령 링크는 `https://www.law.go.kr/법령/{법령명}/제{N}조`, 판례 링크는 `https://www.law.go.kr/판례/({사건번호})`다. 대법원이 아니거나 사건번호가 없으면 판례 `url`은 도표 `source`로 한다.
  - 협회의 해설 글, 조문 본문, 판결 요지는 저장하지 않는다.
- **저장소:** 공개 저장소다. 영상, 키, 서명 URL은 커밋하지 않는다(`eval/videos`는 git 무시).
- **평가 영상 위치:** `apps/api/eval/videos`(6개)와 `~/workspace/university/사고영상`(30개)이다. 명령에 두 폴더를 모두 준다.
- **통과 조건:**
  - 각 작업 끝에 `cd apps/api && uv run pytest -m 'not model'`이 통과해야 한다.
  - 웹을 바꾸면 `cd apps/web && pnpm vitest run`, 앱을 바꾸면 `cd apps/app && pnpm test && pnpm exec tsc --noEmit`도 통과해야 한다.
  - 테스트 DB는 `dashpi_test`다.

## Review Focus

1. **사고 없는 영상의 오탐:** 흔들림이 큰 비포장길이나 과속방지턱, 경적이나 음악이 섞인 영상에서 추정이 켜지면 안 된다. 흔들림 단독, 소리 단독, 시각이 떨어진 두 신호는 추정하지 않아야 한다. → Task 3의 `estimate_collision` 테스트
2. **추정 레포트의 시각:**
   - 추정 레포트의 모든 시각은 보여 준 프레임 근처이거나 센서 시각이어야 한다.
   - LLM이 센서 시각을 인용할 수 없어야 한다. 센서 사실은 LLM 입력에 없다.
   - → Task 3, 4의 테스트
3. **소리 없는 영상, 짧은 영상, 추적 없는 영상:** 급정지 계산이 오류 없이 0을 내고, 추정은 꺼져야 한다. → Task 2 테스트
4. **법규 수집의 실패:** 페이지에 "관련 법규"나 "판례"가 없거나 형식이 다르면, 그 도표는 빈 목록이고 나머지는 계속 처리해야 한다. → Task 5 테스트
5. **오래된 레포트:** `laws`, `cases`가 없는 저장된 레포트도 API와 웹·앱이 그대로 읽어야 한다. → Task 5, 6 테스트

---

### Task 1: 후보 단계 원인 분석과 trace 저장

**Files:**
- Create: `apps/api/scripts/candidate_check.py`
- Modify: `apps/api/app/evaluate.py` (`run_clip` 결과에 후보 저장)
- Test: `apps/api/tests/test_evaluate.py`에 추가

**Interfaces:**
- Produces:
  - `run_clip` 행에 `"candidates": [{"t": float, "score": float, "signals": {...}}]`를 추가한다. 값은 `res.trace["candidates"]` 그대로다.
  - `candidate_check.py`의 동작:
    - 입력: `--videos <폴더>...`, `--out <md 경로>`
    - 처리: 정답 영상마다 `media`, `scan`, `audio_envelope`, `find_candidates`를 돌린다. LLM은 부르지 않는다.
    - 출력 md 표의 열: `파일 | 분할 | 정답 충돌 | 가장 가까운 후보(초) | 차이 | 후보 신호 | 판정`. 판정은 `후보 있음`(1초 이내), `후보 없음`, `무사고`다.
    - 같은 내용을 JSON(`--out`과 같은 이름의 `.json`)으로도 저장한다. Task 7의 오프라인 임계값 조정에 쓴다.
    - JSON에는 후보 목록 외에도 `find_candidates`가 계산한 시각별 신호 배열(`box`, `motion`, `audio`, 그리고 Task 2 이후 `decel`)을 넣는다.

- [ ] **Step 1: 실패하는 테스트 작성** — `test_run_clip_saves_candidates`: 가짜 `run_pipeline`이 `trace["candidates"]=[{"t":1.0,"score":0.5,"signals":{"box":0.5}}]`을 돌려줄 때 행의 `candidates`가 같은 값인지 확인한다(기존 `test_evaluate.py`의 가짜 파이프라인 방식을 따른다).
- [ ] **Step 2: 실패 확인** — `cd apps/api && uv run pytest tests/test_evaluate.py -k candidates -v` → FAIL
- [ ] **Step 3: `run_clip`에 `candidates` 추가, `candidate_check.py` 작성.** `find_candidates`에 시각별 신호를 돌려받는 길이 필요하면 선택 인자(`debug: dict | None = None`)로 배열을 채워 준다(동작은 바꾸지 않는다).
- [ ] **Step 4: 통과 확인** — `uv run pytest -m 'not model'` → PASS
- [ ] **Step 5: 실행**
  - 명령: `cd apps/api && uv run python scripts/candidate_check.py --videos eval/videos ~/workspace/university/사고영상 --out eval/results/<시각>-candidates.md`
  - 기대: 36개 행이 나온다. 보고서에 다음을 적는다.
    - 정답이 사고인 영상 18개 중 `후보 있음`과 `후보 없음`의 수
    - 기존 첫 측정(`eval/results/20261105T163412Z-first.json`)에서 `none`이 나온 영상 중 `후보 있음`인 수. 판단 단계에서 빠진 영상이다.
- [ ] **Step 6: 커밋** — `git add apps/api/scripts/candidate_check.py apps/api/app/evaluate.py apps/api/tests/test_evaluate.py apps/api/eval/results/*-candidates.*` / `feat(eval): 후보 단계 원인 분석과 후보 trace 저장`

---

### Task 2: 상대 차 급정지 신호와 신호별 시각

**Files:**
- Modify: `apps/api/app/pipeline/locate.py`
- Test: `apps/api/tests/test_locate.py`에 추가

**Interfaces:**
- Consumes: `TrackPoint(t, box, cls, conf)`, `_risk`, `drop_hood`, `_normalized`, `_sudden`, `_spread`
- Produces:
  - `WEIGHTS = {"box": 0.4, "motion": 0.25, "audio": 0.15, "decel": 0.2}`. 초기값이고, Task 7에서 조정한다.
  - `Candidate`에 `peaks: dict[str, float | None]`를 추가한다. 신호별로 후보 시각 ±`ALIGN_S` 안에서 원래(번지기 전) 값이 가장 큰 시각이다. 그 신호가 0이면 `None`이다.
  - `_decel(tracks, width, height, n) -> np.ndarray`: 시각별 급정지 점수다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `test_decel_peaks_when_lead_car_stops`: 경로 가운데 차가 매 0.2초 상자 아래변이 일정하게 내려오다가(접근), t=5.0에서 크기 변화가 멈춘다. `_decel`의 최댓값이 t∈[4.8, 5.4]에 있어야 한다.
  - `test_decel_zero_without_tracks_or_short_track`: 트랙이 없거나 점이 `SHORT_TRACK_POINTS` 미만이면 모두 0이다.
  - `test_candidate_records_signal_peaks`: 합성 입력(t=5.0 근처 motion·audio 급변)으로 후보의 `peaks["motion"]`, `peaks["audio"]`가 4.6~5.4 안의 값이고, 신호가 없는 키는 `None`이다.
  - `test_off_path_car_stop_ignored`: 경로 밖(화면 가장자리) 차의 정지는 경로 가운데 차보다 점수가 작다(`OFF_PATH_RISK` 비율).
- [ ] **Step 2: 실패 확인** — `uv run pytest tests/test_locate.py -v` → 새 테스트 FAIL
- [ ] **Step 3: 구현**
  - 접근 속도는 트랙의 `_risk` 시계열을 시간으로 미분해 어림한다(가까워지는 속도).
  - 급정지 점수는 `BOX_WINDOW_S` 안에서 접근 속도가 줄어든 양이다. 앞부분이 빠르게 접근했다가 갑자기 줄어든 경우만 크다.
  - 정규화는 다른 신호처럼 `_normalized(_sudden(...))`, `DECEL_MAD_K`, `DECEL_MAD_FLOOR` 상수를 둔다. 값은 구현자가 합성 테스트와 Task 1 결과를 보고 정하고, 주석에 근거를 적는다.
  - `find_candidates`의 `peaks`와 `series`에 `"decel"`을 넣는다.
  - 기존 테스트가 가중치 변화로 깨지면, 기대값을 새 가중치 기준으로 고치고 그 이유를 보고서에 적는다.
- [ ] **Step 4: 통과 확인** — `uv run pytest -m 'not model'` → PASS
- [ ] **Step 5: 커밋** — `feat(api): 상대 차 급정지 신호와 신호별 시각`

---

### Task 3: 충돌 추정

**Files:**
- Create: `apps/api/app/pipeline/estimate.py`
- Modify: `apps/api/app/pipeline/assess.py`, `apps/api/app/pipeline/run.py`
- Test: `apps/api/tests/test_estimate.py`(새 파일), `apps/api/tests/test_observe_assess.py`에 추가, `apps/api/tests/test_pipeline.py`에 추가

**Interfaces:**
- Consumes: Task 2의 `Candidate(t, score, signals, peaks)`
- Produces:
  - `estimate.py`:
    - `STRONG = {"motion": 0.6, "audio": 0.6, "decel": 0.6}`. 초기값이고, Task 7에서 조정한다.
    - `SENSOR_TEXT = {"audio": "충돌음이 크게 남", "motion": "화면이 크게 흔들림", "decel": "앞차가 급정지함"}`
    - `@dataclass Estimate: t: float; facts: list[Evidence]`
    - `estimate_collision(candidates: list[Candidate]) -> Estimate | None`
  - `assess(observation, keyframes, table, llm, duration, estimate: Estimate | None = None) -> Report`
  - `ESTIMATE_PREFIX = "충돌 추정: "`

- [ ] **Step 1: 실패하는 테스트 작성** (`test_estimate.py`)

```python
def c(t, motion=0.0, audio=0.0, decel=0.0, peaks=None):
    return Candidate(t, 0.5, {"box": 0.0, "motion": motion, "audio": audio, "decel": decel},
                     peaks or {"box": None, "motion": t if motion else None, "audio": t if audio else None,
                               "decel": t if decel else None})

def test_shake_and_sound_estimates():
    e = estimate_collision([c(5.0, motion=0.9, audio=0.8)])
    assert e and e.t == 5.0 and {f.text for f in e.facts} == {"화면이 크게 흔들림", "충돌음이 크게 남"}

def test_shake_required():
    assert estimate_collision([c(5.0, audio=0.9, decel=0.9)]) is None

def test_single_signal_not_enough():
    assert estimate_collision([c(5.0, motion=0.95)]) is None

def test_signals_far_apart_not_aligned():
    assert estimate_collision([c(5.0, motion=0.9, audio=0.9, peaks={"box": None, "motion": 5.0, "audio": 6.5, "decel": None})]) is None

def test_earliest_signal_time_is_collision_t():
    e = estimate_collision([c(5.0, motion=0.9, decel=0.9, peaks={"box": None, "motion": 5.2, "audio": None, "decel": 4.9})])
    assert e.t == 4.9 and [f.t for f in e.facts] == [4.9, 5.2]

def test_strongest_candidate_wins():
    e = estimate_collision([c(3.0, motion=0.7, audio=0.7), c(8.0, motion=0.95, audio=0.9)])
    assert e.t == 8.0
```

  `test_observe_assess.py`에 추가할 테스트:
  - `test_estimate_path_when_observation_none`: 관찰이 `none`이고 `estimate`가 있으면 결과는 다음과 같다.
    - `involvement == "party"`, `confidence == "low"`, `collision_t == estimate.t`
    - `summary`가 `"충돌 추정: "`로 시작한다.
    - `timeline`에 센서 사실이 시각 순서대로 들어 있다.
  - `test_sensor_facts_not_sent_to_llm`: 가짜 LLM이 받은 메시지에 `"충돌음이 크게 남"`이 없다.
  - `test_estimate_without_frame_facts_no_llm`: 프레임 사실이 없으면 다음과 같다.
    - LLM을 부르지 않는다.
    - `fault`는 None이고 `fault_note`가 있다.
    - `summary == "충돌 추정: 센서 신호로 충돌을 추정했지만 영상에서 접촉 장면은 확인하지 못했습니다."`
    - `accident_type`은 None이다.
  - `test_estimate_ignored_when_collision_seen`: 관찰이 `collision_t`를 냈으면 `estimate`가 있어도 기존 경로 결과와 같다.
  - `test_no_estimate_keeps_none`: `estimate=None`이면 지금처럼 `_none`이다.

  `test_pipeline.py`에 추가할 테스트:
  - `test_run_pipeline_passes_estimate`: `run_pipeline`이 `estimate_collision(candidates)` 결과를 `assess`에 넘긴다.
  - 같은 테스트에서 `trace["estimate"]`에 `{"t", "facts"}` 또는 None이 남는지도 확인한다.

- [ ] **Step 2: 실패 확인** — `uv run pytest tests/test_estimate.py tests/test_observe_assess.py tests/test_pipeline.py -v` → 새 테스트 FAIL
- [ ] **Step 3: 구현**

  `estimate_collision`:
  - 각 후보에서 `STRONG` 이상인 신호를 고른다. `motion`이 반드시 포함되고 두 개 이상이어야 한다. 그 신호들의 `peaks` 시각 범위(최대 − 최소)가 `ALIGN_S` 이하인 후보만 남긴다.
  - 그중 강한 신호 값의 합이 가장 큰 후보를 고른다.
  - `t`는 그 신호 `peaks` 시각 중 최솟값이다. `facts`는 신호별 `Evidence(t=peaks[k], text=SENSOR_TEXT[k])`를 시각순으로 둔다.

  `assess`의 추정 경로:
  - **발동:** 관찰이 `none`이거나, 기존 `NO_COLLISION`/`NO_EVIDENCE` 조건에 걸렸고, `estimate`가 있을 때만이다.
  - **관찰 처리:** 관찰의 `involvement`는 `party`로 바꿔 쓴다(`model_copy`). `collision_t`는 `estimate.t`다.
  - **프레임 사실이 있을 때:** 기존 LLM 호출을 그대로 한다(센서 사실 제외). 나온 레포트에 다음을 적용한다.
    - `summary` 앞에 `ESTIMATE_PREFIX`를 붙인다.
    - `confidence="low"`로 한다.
    - `timeline`에 센서 사실을 합쳐 시간순 정렬하고, 같은 시각·문구는 중복 제거한다.
    - `facts`는 프레임 사실만 둔다.
  - **프레임 사실이 없을 때:** LLM 없이 Step 1의 고정 문구로 레포트를 만든다. `fault_note`는 기존 `NO_CHART`다.

  `run.py`: `assess` 호출 앞에서 `estimate = estimate_collision(candidates)`를 구해 넘기고, `trace["estimate"]`에 남긴다. 추적이 없거나 후보가 없으면 None이다.

- [ ] **Step 4: 통과 확인** — `uv run pytest -m 'not model'` → PASS
- [ ] **Step 5: 커밋** — `feat(api): 센서 신호로 충돌 추정`

---

### Task 4: 근거 시각 검증 보강과 표본 분리

**Files:**
- Modify: `apps/api/app/pipeline/assess.py`, `apps/api/app/evaluate.py`
- Test: `apps/api/tests/test_observe_assess.py`, `apps/api/tests/test_evaluate.py`에 추가

**Interfaces:**
- Consumes: Task 3의 `Estimate`, `SENSOR_TEXT`
- Produces:
  - `run_clip`의 `evidence` 항목에 `"source": "frame" | "sensor"`를 붙인다. `text`가 `SENSOR_TEXT` 값이고 `t`가 `trace["estimate"]["facts"]` 중 하나와 같으면 sensor다.
  - `evidence_sample`과 `evidence_rate`는 `source == "frame"`만 합격선 계산에 쓴다. 센서 개수는 따로 보고한다(`render` 표에 `| 근거 시각 표본(센서) | 개수 |` 줄을 추가).

- [ ] **Step 1: 실패하는 테스트 작성**
  - `test_all_cited_times_near_frames`: 가짜 LLM이 보여 준 프레임에서 3초 떨어진 사실 번호를 인용하도록 만든다. 레포트의 어느 시각에도 그 사실이 없어야 한다. 대상은 `timeline`, `fault.steps`, `serious_violations`, `favorable`/`unfavorable`의 괄호 시각이다.
  - `test_estimate_timeline_times_are_frame_or_sensor`: 추정 레포트의 모든 `timeline` 시각이 `near_frame` 또는 센서 시각이다.
  - `test_evidence_sample_counts_frame_only`: `source`가 섞인 행에서 합격선 분모가 frame 항목 수다.
- [ ] **Step 2: 실패 확인 → Step 3: 구현** — 이미 `near_frame`으로 거른 `facts`만 인용되므로, 빠진 경로가 있으면 막는다(구현자가 확인해 보고서에 "빠진 경로 없음" 또는 막은 곳을 적는다).
- [ ] **Step 4: 통과 확인** — `uv run pytest -m 'not model'` → PASS
- [ ] **Step 5: 커밋** — `feat(api): 근거 시각 검증 보강과 센서 근거 분리 집계`

---

### Task 5: 법규·판례 수집과 레포트 항목

**Files:**
- Create: `apps/api/scripts/collect_legal.py`
- Modify: `apps/api/data/fault_charts.json`(수집 결과), `apps/api/app/fault.py`(`Chart`), `apps/api/app/report.py`(`FaultAssessment`, `LawRef`, `CaseRef`), `apps/api/app/pipeline/assess.py`(`_fault`가 도표의 법규·판례를 싣기)
- Modify: `apps/web/openapi.json`, `apps/web/lib/api.gen.ts`, `apps/app/src/lib/api.gen.ts`(같은 파일 복사)
- Test: `apps/api/tests/test_legal.py`(새 파일), `apps/api/tests/test_report.py`·`test_models.py` 해당 부분

**Interfaces:**
- Produces:
  - `report.py`:
    - `class LawRef(BaseModel): name: str; article: str; title: str; url: str`
    - `class CaseRef(BaseModel): court: str; date: str; number: str; url: str`
    - `FaultAssessment.laws: list[LawRef] = []`, `FaultAssessment.cases: list[CaseRef] = []`
  - `Chart.laws: list[LawRef] = []`, `Chart.cases: list[CaseRef] = []`
  - `collect_legal.py`:
    - `parse(html: str, source: str) -> tuple[list[LawRef], list[CaseRef]]`
    - `main()`:
      1. `fault_charts.json`의 도표마다 `source`를 받는다(요청 간격 2초, User-Agent는 일반 브라우저 문자열, 실패는 건너뜀).
      2. 결과를 `laws`와 `cases` 키로 넣어 다시 쓴다.
      3. 도표별 개수를 출력한다.

- [ ] **Step 1: 실패하는 테스트 작성** (`test_legal.py`, 고정 HTML 조각 사용 — 저장소에 협회 페이지 전체를 넣지 않는다. 필요한 문장 몇 줄만 직접 쓴다)

```python
HTML = """<div>관련 법규</div><div>도로교통법 제19조(안전거리 확보 등) ③ 모든 차의 운전자는 ...</div>
<div>도로교통법 제14조(차로의 설치 등) ⑤ ...</div><div>판례·조정사례</div>
<div>대법원 1986.12 9. 선고 86다카1551 판결 모든 차는 ...</div><div>서울중앙지방법원 2018.5.29 선고 2017나12345 판결 ...</div>"""

def test_parse_laws_and_cases():
    laws, cases = parse(HTML, "https://accident.knia.or.kr/x")
    assert [(l.name, l.article, l.title) for l in laws] == [("도로교통법", "제19조", "안전거리 확보 등"), ("도로교통법", "제14조", "차로의 설치 등")]
    assert laws[0].url == "https://www.law.go.kr/법령/도로교통법/제19조"
    assert cases[0].court == "대법원" and cases[0].number == "86다카1551" and cases[0].url == "https://www.law.go.kr/판례/(86다카1551)"
    assert cases[1].court == "서울중앙지방법원" and cases[1].url == "https://accident.knia.or.kr/x"

def test_parse_missing_sections_returns_empty():
    assert parse("<div>내용 없음</div>", "s") == ([], [])

def test_parse_dedupes_same_article():
    laws, _ = parse(HTML + "<div>관련 법규</div><div>도로교통법 제19조(안전거리 확보 등)</div>", "s")
    assert sum(l.article == "제19조" for l in laws) == 1

def test_old_report_without_laws_loads():
    FaultAssessment.model_validate({... 기존 필드만 ...})  # laws, cases 기본 빈 목록
```

  `test_observe_assess.py`에 추가할 테스트: `_fault`가 도표의 `laws`, `cases`를 그대로 싣는지 확인한다.

- [ ] **Step 2: 실패 확인 → Step 3: 구현.**
  - `parse`는 "관련 법규" 블록에서 `{법령명} 제{N}조(제목)` 형식만 뽑는다. `제{N}조의{M}`은 `article="제N조의M"`이다.
  - 판례는 "판례·조정사례" 블록에서 `{법원} {날짜} 선고 {사건번호} 판결` 형식을 뽑는다.
  - 본문 문장은 저장하지 않는다.
- [ ] **Step 4: 수집 실행** — `cd apps/api && uv run python scripts/collect_legal.py`. 기대: 24개 도표 대부분에 법규 1개 이상. 0개인 도표 목록을 보고서에 적는다.
- [ ] **Step 5: 타입 재생성** — README의 명령(`cd apps/web && TOSS_SECRET_KEY=test_x DATABASE_URL=postgresql:///dashpi_test uv run --project ../api python ../api/scripts/dump_openapi.py && pnpm gen:api`)을 실행하고, `cp apps/web/lib/api.gen.ts apps/app/src/lib/api.gen.ts`로 복사한다.
- [ ] **Step 6: 통과 확인** — `uv run pytest -m 'not model'`, `cd apps/web && pnpm exec tsc --noEmit && pnpm vitest run`, `cd apps/app && pnpm exec tsc --noEmit && pnpm test` → 모두 PASS
- [ ] **Step 7: 커밋** — `feat(api): 도표별 관련 법규와 판례를 레포트에 싣기`

---

### Task 6: 웹과 앱에 법규·판례 표시

**Files:**
- Modify: `apps/web/components/analysis/FaultBreakdown.tsx`, `apps/web/components/analysis/fixtures.ts`, `apps/web/components/analysis/analysis.test.tsx`
- Modify: `apps/app/src/components/analysis.tsx`(기준 탭의 `FaultBreakdown`), `apps/app/src/lib/report-html.ts`
- Test: `apps/app/src/components/report.test.tsx`, `apps/app/src/lib/report-html.test.ts`에 추가

**Interfaces:**
- Consumes: Task 5의 `fault.laws`, `fault.cases`(생성 타입)
- Produces:
  - 웹과 앱 "기준" 영역에 "관련 법규" 목록(`{name} {article}({title})`)과 "참고 판례" 목록(`{court} {date} {number}`)을 둔다. 항목을 누르면 `url`을 연다(웹은 새 탭 `rel="noopener"`, 앱은 `WebBrowser.openBrowserAsync`).
  - 목록이 비면 그 제목까지 숨긴다.
  - PDF에는 같은 두 목록을 링크 없이 글로 넣는다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - 웹 `analysis.test.tsx`: fixtures에 `laws`, `cases`를 넣은 레포트에서 "관련 법규"와 "도로교통법 제19조(안전거리 확보 등)" 링크(`href`)가 보인다. `laws=[]`이면 "관련 법규" 글자가 없다.
  - 앱 `report.test.tsx`: 기준 탭에서 같은 문구가 보인다. 항목을 누르면 `WebBrowser.openBrowserAsync`가 해당 `url`로 불린다(mock).
  - 앱 `report-html.test.ts`: HTML에 "관련 법규"와 조문 표기가 있다. 비면 없다. 사용자 입력이 아닌 값도 기존 이스케이프 함수를 거친다.
- [ ] **Step 2: 실패 확인 → Step 3: 구현** — 웹은 기존 FaultBreakdown 스타일, 앱은 기존 디자인 시스템(`Card`, `ListRow`, `Icon`)을 쓴다.
- [ ] **Step 4: 통과 확인** — `cd apps/web && pnpm vitest run && pnpm build`, `cd apps/app && pnpm test && pnpm exec tsc --noEmit` → PASS
- [ ] **Step 5: 커밋** — `feat: 레포트 기준에 관련 법규와 참고 판례 표시`

---

### Task 7: 임계값 조정과 재측정

**Files:**
- Create: `apps/api/scripts/tune_estimate.py`
- Modify: `apps/api/app/pipeline/locate.py`(`WEIGHTS`, `DECEL_*`), `apps/api/app/pipeline/estimate.py`(`STRONG`)
- Modify: `README.md`(평가 결과), `docs/analysis-quality.md`
- Create: `apps/api/eval/results/<시각>-*.md|json`

**Interfaces:**
- Consumes: Task 1의 후보 JSON(시각별 신호 배열), Task 2·3의 함수
- Produces: `tune_estimate.py --candidates <json> --split tuned`
  - 동작: `STRONG` 격자(0.4~0.9, 0.05 간격)마다 각 영상의 추정 결과를 계산한다. LLM은 부르지 않는다.
  - 출력: 다음 열을 담은 표
    - 사고 영상 중 추정된 수
    - 추정 시각이 정답 1초 이내인 수
    - 무사고 영상 중 추정된 수(0이어야 함)

- [ ] **Step 1: 오프라인 조정**
  - Task 1 스크립트를 Task 2 코드로 다시 돌려 후보 JSON을 새로 만든다.
  - `tune_estimate.py`로 `tuned` 분할에서 무사고 추정 0을 지키며 사고 추정이 가장 많은 값을 고른다.
  - 같은 값을 `t8_only`와 `held_out`에도 적용해 결과를 함께 적는다.
  - 고른 값을 `STRONG`, 필요하면 `WEIGHTS`에 넣는다.
  - 무사고 영상 전체(11개 미정 포함)에서 추정이 켜진 영상이 있으면 그 목록을 보고서에 적는다.
- [ ] **Step 2: 테스트** — `uv run pytest -m 'not model'` → PASS(값 변경으로 깨지는 테스트는 의도를 유지해 갱신)
- [ ] **Step 3: 커밋** — `feat(api): 충돌 추정 임계값 조정`
- [ ] **Step 4: 전체 재측정 — controller가 사용자 승인을 받은 뒤에만**
  - 명령: `cd apps/api && uv run python -m app.evaluate --videos eval/videos ~/workspace/university/사고영상 --draft`
  - 비용: 약 10달러 이내다. `evaluate`의 예산 상한을 확인하고 넘으면 멈춘다.
  - 결과: `eval/results`에 저장된다.
- [ ] **Step 5: 근거 시각 표본 판정**
  - 결과의 frame 근거 표본 30개 이상을 `evidence_checks.json` 형식으로 만든다.
  - 각 시각의 프레임 이미지(`ffmpeg -ss`로 추출, 저장소 밖 scratchpad)를 controller가 보고 `ok`를 판정한다.
  - `--rescore`로 근거 시각 지표를 채운다.
- [ ] **Step 6: 문서 갱신**
  - README "평가 결과" 표를 새 값으로 바꾼다. "초안 정답 기준"이라고 적는다.
  - `docs/analysis-quality.md`에 다음을 추가한다.
    - 이번 결과(이전 값과 비교)
    - 추정이 켜진 영상 목록
    - 원인 분석 표 요약
    - Jev "나중에 검토" 조건
- [ ] **Step 7: 커밋** — `docs: 충돌 추정 재측정 결과`
