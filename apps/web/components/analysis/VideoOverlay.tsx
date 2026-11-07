"use client";

import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import type { Overlay, OverlayBox, OverlayFrame } from "./types";

const MAX_GAP_S = 0.4; // 추적은 초당 5장이다. 이보다 먼 프레임의 박스는 다른 장면을 가리킨다.
const NO_BOXES: OverlayBox[] = [];

const LABELS: Record<string, string> = {
  person: "사람",
  bicycle: "자전거",
  car: "차량",
  motorcycle: "오토바이",
  bus: "버스",
  truck: "트럭",
  "traffic light": "신호등",
};

/** frames는 t 오름차순이다. 재생 시각에 가장 가까운 프레임의 박스를 고른다. */
export function boxesAt(frames: OverlayFrame[], t: number): OverlayBox[] {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const near = [frames[lo - 1], frames[lo]]
    .filter(Boolean)
    .sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  return near && Math.abs(near.t - t) <= MAX_GAP_S ? near.boxes : NO_BOXES;
}

type Props = {
  src: string;
  overlayUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  width?: number;
  height?: number;
  onTime?: (t: number) => void;
  onReload?: () => void;
};

export function VideoOverlay({ src, overlayUrl, videoRef, width, height, onTime, onReload }: Props) {
  const [frames, setFrames] = useState<OverlayFrame[]>([]);
  const [boxes, setBoxes] = useState(NO_BOXES);
  const [overlayFailed, setOverlayFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (!overlayUrl) return;
    let cancelled = false;
    // 서명 URL이라 인증 헤더 없이 받는다. 실패해도 영상은 박스 없이 재생된다.
    fetch(overlayUrl)
      .then((r) => (r.ok ? (r.json() as Promise<Overlay>) : Promise.reject(new Error(String(r.status)))))
      .then((o) => {
        if (!cancelled) setFrames(o.frames);
      })
      .catch(() => {
        if (!cancelled) setOverlayFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [overlayUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const draw = (t: number) => {
      setBoxes(boxesAt(frames, t));
      onTime?.(t);
    };
    const fromElement = () => draw(video.currentTime);
    draw(video.currentTime);
    video.addEventListener("seeked", fromElement);

    if (typeof video.requestVideoFrameCallback === "function") {
      let handle = 0;
      const step: VideoFrameRequestCallback = (_, meta) => {
        draw(meta.mediaTime);
        handle = video.requestVideoFrameCallback(step);
      };
      handle = video.requestVideoFrameCallback(step);
      return () => {
        video.removeEventListener("seeked", fromElement);
        video.cancelVideoFrameCallback(handle);
      };
    }
    video.addEventListener("timeupdate", fromElement);
    return () => {
      video.removeEventListener("seeked", fromElement);
      video.removeEventListener("timeupdate", fromElement);
    };
  }, [frames, onTime, videoRef]);

  return (
    <figure className="flex flex-col gap-2 print:hidden">
      <div className="bg-black">
        <div className="relative mx-auto w-fit max-w-full">
          <video
            ref={videoRef}
            src={src}
            width={width}
            height={height}
            controls
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
            className="block h-auto max-h-[70vh] w-auto max-w-full"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {boxes.map(({ id, cls, box: [x1, y1, x2, y2] }) => (
              <div
                key={id}
                className="absolute border-2 border-accent"
                style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}
              >
                <span className="absolute top-0 left-0 bg-accent px-1 text-[11px] leading-4 font-bold whitespace-nowrap text-white">
                  {LABELS[cls] ?? cls}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {videoFailed ? (
        <figcaption role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
          영상을 불러오지 못했습니다. 재생 주소가 만료됐을 수 있습니다.
          {onReload && (
            <Button size="sm" variant="secondary" onClick={onReload}>
              다시 불러오기
            </Button>
          )}
        </figcaption>
      ) : (
        <figcaption className="hud text-muted">
          {overlayFailed ? "객체 박스를 불러오지 못했습니다. 영상만 재생합니다." : "파란 상자는 AI가 추적한 차량과 사람입니다"}
        </figcaption>
      )}
    </figure>
  );
}
