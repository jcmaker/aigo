import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AnalysisDetail } from "./AnalysisDetail";
import { AnalysisList } from "./AnalysisList";
import { analysis, failed, finished, NO_CHART, NONE, OVERLAY, PARTY, running, WITNESS } from "./fixtures";
import { ProgressView } from "./ProgressView";
import { ReportView } from "./ReportView";
import { DISCLAIMER } from "./types";
import { UploadForm } from "./UploadForm";
import { boxesAt, VideoOverlay } from "./VideoOverlay";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const auth = vi.hoisted(() => ({ getToken: async () => "tok" })); // Clerk처럼 렌더마다 같은 함수를 돌려준다
vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn();
const calls = (method: string, suffix: string) =>
  fetchMock.mock.calls.filter(([u, init]) => String(u).endsWith(suffix) && (init?.method ?? "GET") === method);

class FakeXhr {
  static last: FakeXhr[] = [];
  upload: { onprogress?: (e: Partial<ProgressEvent>) => void } = {};
  headers: Record<string, string> = {};
  status = 0;
  method = "";
  url = "";
  body: unknown;
  aborted = false;
  onload?: () => void;
  onerror?: () => void;
  constructor() {
    FakeXhr.last.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
  }
  succeed() {
    this.status = 200;
    this.onload?.();
  }
}

const TICKET = {
  id: 12,
  upload_url: "https://bucket.test/put?sig=1",
  upload_headers: { "Content-Type": "video/mp4" },
  expires_at: "2999-01-01T00:00:00Z",
};

beforeEach(() => {
  fetchMock.mockReset();
  router.push.mockReset();
  FakeXhr.last = [];
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

const video = (name = "clip.mp4", size = 1000) => {
  const f = new File(["x"], name, { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const pick = (file: File) => fireEvent.change(screen.getByLabelText(/영상 파일/), { target: { files: [file] } });
const agree = () => fireEvent.click(screen.getByRole("checkbox"));
const startButton = () => screen.getByRole<HTMLButtonElement>("button", { name: /분석 시작|다시 시도/ });
const startUpload = async () => {
  fireEvent.click(startButton());
  await waitFor(() => expect(FakeXhr.last.length).toBeGreaterThan(0));
  return FakeXhr.last.at(-1)!;
};

test("동의 전에는 업로드할 수 없다", () => {
  render(<UploadForm />);
  pick(video());
  expect(startButton().disabled).toBe(true);
  agree();
  expect(startButton().disabled).toBe(false);
});

test("번호판과 얼굴, OpenAI 전송 안내를 업로드 전에 보여 준다", () => {
  render(<UploadForm />);
  expect(screen.getByText(/번호판과 얼굴이 담길 수 있고/)).toBeTruthy();
  expect(screen.getByText(/프레임이 OpenAI로 전송되며/)).toBeTruthy();
  expect(screen.getByText(/삭제하면 파일까지 지웁니다/)).toBeTruthy();
});

test("큰 파일과 지원하지 않는 형식을 업로드 전에 막는다", () => {
  render(<UploadForm />);
  agree();
  pick(video("clip.mp4", 200 * 1024 * 1024 + 1));
  expect(screen.getByText(/200MB 이하/)).toBeTruthy();
  expect(startButton().disabled).toBe(true);
  pick(video("clip.mkv"));
  expect(screen.getByText(/mp4, mov, webm, avi/, { selector: "[role=alert] *" })).toBeTruthy();
  expect(startButton().disabled).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("서명 URL에 받은 헤더 그대로 PUT하고 제출한 뒤 분석 화면으로 간다", async () => {
  fetchMock.mockResolvedValueOnce(json(201, TICKET)).mockResolvedValueOnce(json(200, analysis({ status: "queued" })));
  render(<UploadForm />);
  pick(video());
  agree();
  const xhr = await startUpload();
  expect(JSON.parse(calls("POST", "/api/v1/analyses")[0][1].body)).toMatchObject({ filename: "clip.mp4", size: 1000, consent: true });
  expect([xhr.method, xhr.url]).toEqual(["PUT", TICKET.upload_url]);
  expect(xhr.headers).toEqual(TICKET.upload_headers);
  xhr.succeed();
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/analyses/12"));
  expect(calls("POST", "/api/v1/analyses/12/submit")).toHaveLength(1);
});

test("업로드 진행률을 표시하고 실패 시 재시도할 수 있다", async () => {
  fetchMock.mockResolvedValueOnce(json(201, TICKET)).mockResolvedValueOnce(json(200, analysis({ status: "queued" })));
  render(<UploadForm />);
  pick(video());
  agree();
  const first = await startUpload();
  act(() => first.upload.onprogress?.({ lengthComputable: true, loaded: 420, total: 1000 }));
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
  act(() => first.onerror?.());
  expect(await screen.findByRole("alert")).toBeTruthy();

  const second = await (async () => {
    fireEvent.click(startButton());
    await waitFor(() => expect(FakeXhr.last).toHaveLength(2));
    return FakeXhr.last[1];
  })();
  expect(calls("POST", "/api/v1/analyses")).toHaveLength(1); // 재시도가 하루 한도를 다시 쓰지 않는다
  second.succeed();
  await waitFor(() => expect(router.push).toHaveBeenCalled());
});

test("제출이 UPLOAD_INCOMPLETE면 영상을 다시 올린다", async () => {
  fetchMock
    .mockResolvedValueOnce(json(201, TICKET))
    .mockResolvedValueOnce(json(409, { code: "UPLOAD_INCOMPLETE", message: "영상 업로드가 끝나지 않았습니다. 다시 올려 주세요." }));
  render(<UploadForm />);
  pick(video());
  agree();
  (await startUpload()).succeed();
  expect(await screen.findByText(/업로드가 끝나지 않았습니다/)).toBeTruthy();
  fireEvent.click(startButton());
  await waitFor(() => expect(FakeXhr.last).toHaveLength(2));
});

test.each([
  ["DAILY_LIMIT", "하루 분석 한도(5건)를 모두 사용했습니다.", /오늘 올릴 수 있는 분석을 모두 썼습니다/],
  ["SERVICE_LIMIT", "오늘 서비스 전체 분석 한도에 도달했습니다. 내일 다시 이용해 주세요.", /오늘 서비스 분석이 마감됐습니다/],
])("%s는 재시도를 막고 이유를 보여 준다", async (code, message, title) => {
  fetchMock.mockResolvedValueOnce(json(429, { code, message }));
  render(<UploadForm />);
  pick(video());
  agree();
  fireEvent.click(startButton());
  expect(await screen.findByText(title)).toBeTruthy();
  expect(screen.getByText(message)).toBeTruthy();
  expect(startButton().disabled).toBe(true);
});

test.each([
  ["INVALID_VIDEO", /영상을 읽지 못했습니다/],
  ["VIDEO_TOO_LONG", /영상이 너무 깁니다/],
  ["UPLOAD_CHANGED", /업로드한 영상이 바뀌었습니다/],
  ["INTERNAL_ERROR", /분석 중 문제가 생겼습니다/],
  ["MODEL_TIMEOUT", /AI 분석을 끝내지 못했습니다/],
])("실패 코드 %s를 사용자 문구로 보여 준다", (code, title) => {
  render(<ProgressView analysis={failed(code, "서버 메시지", 1)} />);
  expect(screen.getByRole("alert").textContent).toMatch(title);
  expect(screen.getByText("서버 메시지")).toBeTruthy();
  expect(screen.getByRole("link", { name: "영상 다시 올리기" }).getAttribute("href")).toBe("/analyses/new");
});

test("진행 화면은 단계별 실제 결과를 보여 주고 퍼센트를 지어내지 않는다", () => {
  const { container } = render(<ProgressView analysis={running(4)} />);
  expect(screen.getByText(/1920×1080/)).toBeTruthy();
  expect(screen.getByText(/객체 14개/)).toBeTruthy();
  expect(screen.getByText(/0:09, 0:12/)).toBeTruthy();
  expect(screen.getByText(/5\/6/)).toBeTruthy();
  expect(container.textContent).not.toMatch(/\d+%/);
  expect(container.querySelector("[role=progressbar]")).toBeNull();
});

test("실패하면 멈춘 단계를 진행 중으로 두지 않는다", () => {
  render(<ProgressView analysis={failed("INTERNAL_ERROR", "서버 메시지", 2)} />);
  expect(screen.queryByText("진행 중")).toBeNull();
  expect(screen.getByText("중단")).toBeTruthy();
});

const settle = () => new Promise((r) => setImmediate(r)); // 가짜 타이머를 쓰지 않는 실제 비동기 틈
const tick = (ms = 3000) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
    await settle();
  });

test.each([
  ["done", finished(PARTY)],
  ["failed", failed("INTERNAL_ERROR", "실패", 1)],
])("상태가 %s가 되면 폴링을 멈춘다", async (_, last) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockImplementation(async (u) => (String(u).endsWith("/api/v1/analyses/12") ? json(200, running(1)) : json(200, OVERLAY)));
  render(<AnalysisDetail id="12" />);
  await tick(0);
  await tick();
  expect(calls("GET", "/api/v1/analyses/12")).toHaveLength(2);
  fetchMock.mockImplementation(async (u) => (String(u).endsWith("/api/v1/analyses/12") ? json(200, last) : json(200, OVERLAY)));
  await tick();
  await tick();
  await tick();
  expect(calls("GET", "/api/v1/analyses/12")).toHaveLength(3);
});

test("화면을 벗어나면 폴링을 멈춘다", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockImplementation(async () => json(200, running(1)));
  const { unmount } = render(<AnalysisDetail id="12" />);
  await tick();
  unmount();
  const before = fetchMock.mock.calls.length;
  await tick();
  await tick();
  expect(fetchMock.mock.calls.length).toBe(before);
});

test("탭이 숨으면 폴링을 쉬고 돌아오면 바로 다시 묻는다", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockImplementation(async () => json(200, running(1)));
  render(<AnalysisDetail id="12" />);
  await tick();
  const setHidden = (value: boolean) => {
    Object.defineProperty(document, "hidden", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  setHidden(true);
  const before = fetchMock.mock.calls.length;
  await tick();
  await tick();
  expect(fetchMock.mock.calls.length).toBe(before);
  setHidden(false);
  await tick(0);
  expect(fetchMock.mock.calls.length).toBe(before + 1);
});

test("일시적인 네트워크 오류에도 폴링을 이어 간다", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockRejectedValueOnce(new TypeError("down")).mockImplementation(async () => json(200, running(1)));
  render(<AnalysisDetail id="12" />);
  await tick();
  await tick();
  expect(screen.getByText("객체 추적")).toBeTruthy();
});

test("없는 분석은 폴링을 멈추고 이유를 보여 준다", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockImplementation(async () => json(404, { code: "ANALYSIS_NOT_FOUND", message: "분석을 찾을 수 없습니다." }));
  render(<AnalysisDetail id="12" />);
  await tick();
  await tick();
  expect(screen.getByText("분석을 찾을 수 없습니다.")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test.each([401, 429])("%i 응답은 멈추지 않고 폴링을 이어 간다", async (status) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock
    .mockResolvedValueOnce(json(200, running(1)))
    .mockResolvedValueOnce(json(status, { code: "X", message: "잠시 뒤 다시" }))
    .mockResolvedValueOnce(json(status, { code: "X", message: "잠시 뒤 다시" }))
    .mockImplementation(async () => json(200, running(2)));
  render(<AnalysisDetail id="12" />);
  await tick();
  await tick();
  await tick();
  expect(screen.queryByText("잠시 뒤 다시")).toBeNull();
  expect(screen.getByText("객체 추적")).toBeTruthy();
  expect(fetchMock.mock.calls.length).toBeGreaterThan(status === 401 ? 3 : 2);
});

test("done인데 레포트가 없으면 실패 안내를 보여 준다", async () => {
  fetchMock.mockImplementation(async () => json(200, { ...finished(PARTY), report: null }));
  render(<AnalysisDetail id="12" />);
  expect(await screen.findByText("레포트를 불러오지 못했습니다")).toBeTruthy();
  expect(screen.queryByText("객체 추적")).toBeNull();
});

test("근거 시각을 누르면 영상이 그 시각으로 이동한다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const { container } = render(<ReportView analysis={finished(PARTY)} />);
  fireEvent.click(screen.getAllByRole("button", { name: "0:07 장면으로 이동" })[0]);
  expect(container.querySelector("video")!.currentTime).toBe(7.8);
});

test("유리한 점의 시각도 영상으로 이동한다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const { container } = render(<ReportView analysis={finished(PARTY)} />);
  const item = screen.getByText(/상대 차가 일시정지 없이/).closest("li")!;
  expect(item.textContent).not.toContain("7.8초");
  fireEvent.click(within(item).getByRole("button"));
  expect(container.querySelector("video")!.currentTime).toBe(7.8);
});

test("involvement none은 이유만 보여 주고 사고가 없다고 단정하지 않는다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const { container } = render(<ReportView analysis={finished(NONE)} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이 영상에서 사고 장면을 확인하지 못했습니다");
  expect(screen.getByText(NONE.reason!)).toBeTruthy();
  expect(screen.getByText(/직접 확인/)).toBeTruthy();
  expect(container.textContent).not.toContain("사고 없음");
  expect(container.textContent).not.toMatch(/신뢰도|과실|타임라인|지금 할 일/);
  expect(container.querySelector("video")).toBeTruthy();
});

test("witness는 과실비율을 보여 주지 않는다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const { container } = render(<ReportView analysis={finished(WITNESS)} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(WITNESS.accident_type);
  expect(container.textContent).not.toMatch(/\d+%/);
  expect(screen.queryByText(/내 과실/)).toBeNull();
  expect(screen.getByText(/제3자 사고/)).toBeTruthy();
});

test("fault가 없으면 fault_note를 보여 준다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const { container } = render(<ReportView analysis={finished(NO_CHART)} />);
  expect(screen.getAllByText(NO_CHART.fault_note!).length).toBeGreaterThan(0);
  expect(container.textContent).not.toMatch(/\d+%/);
});

test("party 레포트는 과실 범위, 수정요소, 출처를 보여 준다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  render(<ReportView analysis={finished(PARTY)} />);
  expect(screen.getAllByText("20~40%").length).toBeGreaterThan(0);
  expect(screen.getByText("상대 일시정지 없이 진입")).toBeTruthy();
  expect(screen.getAllByText("−10").length).toBe(2);
  expect(screen.getByText("내 제한속도 초과 여부")).toBeTruthy();
  expect(screen.getByRole("link", { name: /출처/ }).getAttribute("href")).toBe(PARTY.fault!.source_url);
});

test("레포트 순서는 결론부터 이후 대응까지 정해져 있다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const { container } = render(<ReportView analysis={finished(PARTY)} />);
  const text = container.textContent!;
  const order = ["01/ 결론", "02/ 영상과 타임라인", "03/ 과실 근거", "04/ 유리한 점과 불리한 점", "05/ 12대 중과실", "06/ 확인할 수 없는 사실", "07/ 지금 할 일과 이후 대응"];
  const at = order.map((w) => text.indexOf(w));
  expect(at.every((n) => n >= 0)).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
});

test("심각도가 없으면 숨기고 신뢰도는 쉬운 말과 설명으로 보여 준다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  render(<ReportView analysis={finished(NO_CHART)} />);
  expect(screen.queryByText("심각도")).toBeNull();
  expect(screen.getByText("보통")).toBeTruthy();
  expect(screen.getByText(/과실 판단이 맞을 확률이 아니라/)).toBeTruthy();
});

test.each([["party", PARTY], ["witness", WITNESS], ["none", NONE], ["no-chart", NO_CHART]])(
  "법적 판단이 아니라는 안내가 항상 보인다: %s",
  (_, report) => {
    fetchMock.mockResolvedValue(json(200, OVERLAY));
    render(<ReportView analysis={finished(report)} />);
    expect(screen.getAllByText(DISCLAIMER).length).toBeGreaterThan(0);
  },
);

test("PDF 저장은 인쇄를 연다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(<ReportView analysis={finished(PARTY)} />);
  fireEvent.click(screen.getByRole("button", { name: "PDF로 저장" }));
  expect(print).toHaveBeenCalled();
});

test("삭제 후 목록으로 이동한다", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fetchMock.mockImplementation(async (u, init) => {
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return json(200, String(u).endsWith("overlay.json") ? OVERLAY : finished(PARTY));
  });
  render(<AnalysisDetail id="12" />);
  fireEvent.click(await screen.findByRole("button", { name: "분석 삭제" }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/analyses"));
  expect(calls("DELETE", "/api/v1/analyses/12")).toHaveLength(1);
});

test("삭제를 시작하면 폴링을 멈춘다", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let finish = (_: Response) => {};
  fetchMock.mockImplementation((_, init) =>
    init?.method === "DELETE" ? new Promise((r) => (finish = r)) : Promise.resolve(json(200, running(1))),
  );
  render(<AnalysisDetail id="12" />);
  await tick(0);
  fireEvent.click(screen.getByRole("button", { name: "분석 삭제" }));
  const polled = calls("GET", "/api/v1/analyses/12").length;
  await tick();
  await tick();
  expect(calls("GET", "/api/v1/analyses/12")).toHaveLength(polled);
  await act(async () => finish(new Response(null, { status: 204 })));
  expect(router.push).toHaveBeenCalledWith("/analyses");
});

test("삭제에 실패하면 레포트를 그대로 두고 오류를 보여 준다", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fetchMock.mockImplementation(async (u, init) => {
    if (init?.method === "DELETE") return json(500, { code: "X", message: "삭제에 실패했습니다." });
    return json(200, String(u).endsWith("overlay.json") ? OVERLAY : finished(PARTY));
  });
  render(<AnalysisDetail id="12" />);
  fireEvent.click(await screen.findByRole("button", { name: "분석 삭제" }));
  expect(await screen.findByText("삭제에 실패했습니다.")).toBeTruthy();
  expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  expect(screen.getByRole("button", { name: "분석 삭제" })).toBeTruthy();
  expect(router.push).not.toHaveBeenCalled();
});

test("진행 중 삭제에 실패하면 폴링을 다시 시작한다", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockImplementation(async (_, init) =>
    init?.method === "DELETE" ? json(500, { code: "X", message: "삭제에 실패했습니다." }) : json(200, running(1)),
  );
  render(<AnalysisDetail id="12" />);
  await tick(0);
  fireEvent.click(screen.getByRole("button", { name: "분석 삭제" }));
  await tick(0);
  expect(screen.getByText("삭제에 실패했습니다.")).toBeTruthy();
  const polled = calls("GET", "/api/v1/analyses/12").length;
  await tick();
  await tick();
  expect(calls("GET", "/api/v1/analyses/12").length).toBeGreaterThan(polled);
});

test("삭제를 취소하면 지우지 않는다", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  fetchMock.mockImplementation(async (u) => json(200, String(u).endsWith("overlay.json") ? OVERLAY : finished(PARTY)));
  render(<AnalysisDetail id="12" />);
  fireEvent.click(await screen.findByRole("button", { name: "분석 삭제" }));
  expect(calls("DELETE", "/api/v1/analyses/12")).toHaveLength(0);
});

test("가장 가까운 프레임의 박스를 고르고 멀면 그리지 않는다", () => {
  const frames = [
    { t: 1, boxes: [{ id: 1, cls: "car", box: [0, 0, 1, 1] as number[] }] },
    { t: 1.2, boxes: [{ id: 2, cls: "car", box: [0, 0, 1, 1] as number[] }] },
    { t: 9, boxes: [{ id: 3, cls: "car", box: [0, 0, 1, 1] as number[] }] },
  ];
  expect(boxesAt(frames, 1.15).map((b) => b.id)).toEqual([2]);
  expect(boxesAt(frames, 0.9).map((b) => b.id)).toEqual([1]);
  expect(boxesAt(frames, 5)).toEqual([]);
  expect(boxesAt([], 1)).toEqual([]);
});

test("오버레이 박스를 정규화 좌표 비율로 놓는다", async () => {
  fetchMock.mockResolvedValue(json(200, { width: 100, height: 100, frames: [{ t: 0, boxes: [{ id: 1, cls: "car", box: [0.1, 0.2, 0.5, 0.6] }] }] }));
  const { container } = render(<VideoOverlay src="v" overlayUrl="o" videoRef={{ current: null }} />);
  fireEvent(container.querySelector("video")!, new Event("timeupdate"));
  const box = (await screen.findByText("차량")).parentElement!;
  expect(box.style.left).toBe("10%");
  expect(box.style.top).toBe("20%");
  expect(box.style.width).toBe("40%");
  expect(box.style.height).toBe("40%");
});

test("오버레이를 못 받아도 영상은 재생된다", async () => {
  fetchMock.mockRejectedValue(new TypeError("cors"));
  const { container } = render(<VideoOverlay src="v" overlayUrl="o" videoRef={{ current: null }} />);
  expect(await screen.findByText(/객체 박스를 불러오지 못했습니다/)).toBeTruthy();
  expect(container.querySelector("video")!.getAttribute("src")).toBe("v");
});

test("requestVideoFrameCallback이 있으면 프레임마다 갱신한다", async () => {
  const cb: ((now: number, meta: { mediaTime: number }) => void)[] = [];
  const cancel = vi.fn();
  Object.assign(HTMLVideoElement.prototype, {
    requestVideoFrameCallback: (f: (typeof cb)[number]) => cb.push(f),
    cancelVideoFrameCallback: cancel,
  });
  fetchMock.mockResolvedValue(json(200, { width: 1, height: 1, frames: [{ t: 2, boxes: [{ id: 1, cls: "person", box: [0, 0, 1, 1] }] }] }));
  const { unmount } = render(<VideoOverlay src="v" overlayUrl="o" videoRef={{ current: null }} />);
  await act(async () => {}); // 오버레이 응답을 받고 콜백을 다시 건다
  act(() => cb.at(-1)!(0, { mediaTime: 2 }));
  expect(screen.getByText("사람")).toBeTruthy();
  unmount();
  expect(cancel).toHaveBeenCalled();
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).cancelVideoFrameCallback;
});

test("목록은 완료한 분석의 결과를 보여 주고 none을 사고 없음이라 하지 않는다", () => {
  const { container } = render(
    <AnalysisList items={[{ ...finished(PARTY), id: 1 }, { ...finished(NONE), id: 2 }, { ...failed("INVALID_VIDEO", "x"), id: 3 }]} />,
  );
  expect(screen.getByText(PARTY.accident_type!)).toBeTruthy();
  expect(screen.getByText("사고 장면 미확인")).toBeTruthy();
  expect(container.textContent).not.toContain("사고 없음");
  expect(screen.getByRole("link", { name: PARTY.accident_type! }).getAttribute("href")).toBe("/analyses/1");
});

test("목록이 비어 있으면 첫 분석을 안내한다", () => {
  render(<AnalysisList items={[]} />);
  expect(screen.getByRole("link", { name: "영상 올리기" }).getAttribute("href")).toBe("/analyses/new");
});

test("기준 영역에 관련 법규와 참고 판례를 새 탭 링크로 보인다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  render(<ReportView analysis={finished(PARTY)} />);
  expect(screen.getByText("관련 법규")).toBeTruthy();
  const law = screen.getByRole("link", { name: "도로교통법 제19조(안전거리 확보 등)" });
  expect(law.getAttribute("href")).toBe(PARTY.fault!.laws[0].url);
  expect(law.getAttribute("target")).toBe("_blank");
  expect(law.getAttribute("rel")).toBe("noopener noreferrer");
  expect(screen.getByText("참고 판례")).toBeTruthy();
  expect(screen.getByRole("link", { name: "대법원 1986.12.9. 86다카1551" })).toBeTruthy();
});

test("법규와 판례가 비면 제목도 숨긴다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  render(<ReportView analysis={finished({ ...PARTY, fault: { ...PARTY.fault!, laws: [], cases: [] } })} />);
  expect(screen.queryByText("관련 법규")).toBeNull();
  expect(screen.queryByText("참고 판례")).toBeNull();
});

test("http(s)가 아닌 법규·판례 url은 링크로 만들지 않는다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const f = PARTY.fault!;
  const fault = { ...f, laws: [{ ...f.laws[0], url: "javascript:alert(1)" }], cases: [{ ...f.cases[0], url: "HTTPS://www.law.go.kr/판례/(86다카1551)" }] };
  render(<ReportView analysis={finished({ ...PARTY, fault })} />);
  expect(screen.getByText("도로교통법 제19조(안전거리 확보 등)").closest("a")).toBeNull();
  expect(screen.getByRole("link", { name: "대법원 1986.12.9. 86다카1551" })).toBeTruthy();
});

test("판례 url이 법제처 판례가 아니면(도표 출처) 글로 두고 목록 아래 출처 링크 하나만 둔다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  const f = PARTY.fault!;
  const src = "https://accident.knia.or.kr/myaccident-content?chartNo=1";
  const lower = [
    { court: "서울중앙지방법원", date: "2015.1.1.", number: "2014가단1", url: src },
    { court: "수원지방법원", date: "2016.1.1.", number: "2015나2", url: src },
  ];
  render(<ReportView analysis={finished({ ...PARTY, fault: { ...f, cases: [f.cases[0], ...lower] } })} />);
  expect(screen.getByRole("link", { name: "대법원 1986.12.9. 86다카1551" })).toBeTruthy();
  expect(screen.getByText("서울중앙지방법원 2015.1.1. 2014가단1").closest("a")).toBeNull();
  expect(screen.getByText("수원지방법원 2016.1.1. 2015나2").closest("a")).toBeNull();
  const sources = screen.getAllByRole("link", { name: "출처: 과실비율정보포털" }).filter((a) => a.getAttribute("href") === src);
  expect(sources.length).toBe(1);
});

test("DashPi에서 온 분석만 목록에 DashPi 배지를 단다", () => {
  render(<AnalysisList items={[analysis({ id: 1, source: "dashpi" }), analysis({ id: 2 })]} />);
  const rows = screen.getAllByRole("listitem");
  expect(within(rows[0]).getByText("DashPi")).toBeTruthy();
  expect(within(rows[1]).queryByText("DashPi")).toBeNull();
});

test("DashPi 분석은 진행 화면과 레포트에도 배지가 있다", () => {
  const { unmount } = render(<ProgressView analysis={{ ...running(2), source: "dashpi" }} />);
  expect(screen.getByText("DashPi")).toBeTruthy();
  unmount();
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  render(<ReportView analysis={{ ...finished(PARTY), source: "dashpi" }} />);
  expect(screen.getByText("DashPi")).toBeTruthy();
});

test("직접 올린 분석의 레포트에는 DashPi 배지가 없다", () => {
  fetchMock.mockResolvedValue(json(200, OVERLAY));
  render(<ReportView analysis={finished(PARTY)} />);
  expect(screen.queryByText("DashPi")).toBeNull();
});
