"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ApiError, useApi } from "@/lib/api";
import { FailureNotice } from "./FailureNotice";
import { FAILURES, type UploadTicket } from "./types";

const MAX_MB = 200; // 서버 기본값과 같다. 서버가 다시 확인하므로 달라져도 VIDEO_TOO_LARGE로 막힌다.
const EXTENSIONS = /\.(mp4|mov|webm|avi)$/i;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

function checkFile(file: File) {
  if (!EXTENSIONS.test(file.name)) return "mp4, mov, webm, avi 영상만 올릴 수 있습니다.";
  if (file.size === 0) return "빈 파일입니다. 다른 파일을 골라 주세요.";
  if (file.size > MAX_MB * 1024 * 1024) return `${MAX_MB}MB 이하 영상만 올릴 수 있습니다. 이 파일은 ${mb(file.size)}입니다.`;
  return "";
}

type Phase = "idle" | "uploading" | "submitting";
type Failure = { code: string; message: string };
type Attempt = { file: File; ticket: UploadTicket; uploaded: boolean };

export function UploadForm() {
  const { request } = useApi();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);

  useEffect(() => () => xhr.current?.abort(), []);

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    if (!next) return;
    const problem = checkFile(next);
    setFile(problem ? null : next);
    setFileError(problem);
    setFailure(null);
  }

  function put({ file, ticket }: Attempt) {
    return new Promise<void>((resolve, reject) => {
      const req = new XMLHttpRequest();
      xhr.current = req;
      const fail = () => reject(new ApiError(0, "UPLOAD_FAILED", "영상을 올리지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요."));
      req.open("PUT", ticket.upload_url);
      Object.entries(ticket.upload_headers).forEach(([k, v]) => req.setRequestHeader(k, v));
      req.upload.onprogress = (e) => {
        if (e.lengthComputable) setPercent(Math.round((e.loaded / e.total) * 100));
      };
      req.onload = () => (req.status >= 200 && req.status < 300 ? resolve() : fail());
      req.onerror = fail;
      req.send(file);
    });
  }

  async function start() {
    if (!file) return;
    setFailure(null);
    setPercent(0);
    setPhase("uploading");
    try {
      // 재시도는 같은 분석을 다시 쓴다. 새로 만들면 하루 한도를 또 쓴다.
      let a = attempt.current;
      if (!a || a.file !== file || (!a.uploaded && Date.now() >= Date.parse(a.ticket.expires_at))) {
        const ticket = await request<UploadTicket>("/api/v1/analyses", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.type, consent }),
        });
        a = attempt.current = { file, ticket, uploaded: false };
      }
      if (!a.uploaded) {
        await put(a);
        a.uploaded = true;
      }
      setPhase("submitting");
      await request(`/api/v1/analyses/${a.ticket.id}/submit`, { method: "POST" });
      router.push(`/analyses/${a.ticket.id}`);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "UPLOAD_FAILED", "영상을 올리지 못했습니다. 다시 시도해 주세요.");
      if (err.code === "UPLOAD_INCOMPLETE" && attempt.current) attempt.current.uploaded = false;
      setFailure({ code: err.code, message: err.message });
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const blocked = failure && FAILURES[failure.code]?.final;

  return (
    <form
      className="cells border-b border-line lg:grid-cols-[minmax(0,1fr)_26rem]"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <div className="flex flex-col gap-5 p-5 md:p-10">
        <label className="relative flex min-h-72 flex-col justify-between gap-8 border border-dashed border-line-strong bg-raised p-5 transition-colors duration-[var(--dur-hover)] hover:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent has-[:disabled]:opacity-60 md:min-h-96 md:p-8">
          <span className="hud text-muted">영상 선택</span>
          <input
            type="file"
            accept=".mp4,.mov,.webm,.avi,video/mp4,video/quicktime,video/webm,video/x-msvideo"
            disabled={busy}
            onChange={choose}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
          />
          {file ? (
            <span className="flex flex-col gap-1">
              <span className="text-2xl leading-snug font-bold tracking-[-0.02em] text-ink-strong">{file.name}</span>
              <span className="font-mono text-sm text-muted">{mb(file.size)} · 다른 영상을 고르려면 누르세요</span>
            </span>
          ) : (
            <span className="text-3xl leading-tight font-bold tracking-[-0.02em] text-ink-strong md:text-4xl">
              영상 파일을 끌어다 놓거나
              <br />
              눌러서 고르세요
            </span>
          )}
          <span className="hud text-muted">mp4, mov, webm, avi · {MAX_MB}MB · 2분 이하</span>
        </label>
        {fileError && <Notice tone="danger">{fileError}</Notice>}
      </div>

      <div className="flex flex-col gap-5 p-5 md:p-10">
        <h2 className="hud text-muted">올리기 전에 확인하세요</h2>
        <p className="text-lg leading-relaxed text-ink-strong">
          영상에는 번호판과 얼굴이 담길 수 있고, 분석을 위해 프레임이 OpenAI로 전송되며, 분석을 삭제하면 파일까지 지웁니다.
        </p>
        <label className="flex items-start gap-3 border-t border-line pt-5 text-sm font-semibold">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          위 내용을 확인했고 영상 분석에 동의합니다.
        </label>

        {phase === "uploading" && (
          <div className="flex flex-col gap-2">
            <div className="hud flex justify-between text-muted">
              <span>올리는 중</span>
              <span>{percent}%</span>
            </div>
            <div role="progressbar" aria-label="업로드 진행률" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1 bg-sunken">
              <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
        {phase === "submitting" && <p role="status" className="hud text-muted">분석 대기열에 넣는 중</p>}
        {failure && <FailureNotice {...failure} />}

        <Button type="submit" size="lg" full loading={busy} disabled={!file || !consent || !!blocked}>
          {failure ? "다시 시도" : "올리고 분석 시작"}
        </Button>
      </div>
    </form>
  );
}
