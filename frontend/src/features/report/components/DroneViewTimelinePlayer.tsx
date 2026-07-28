import { useEffect, useMemo, useRef, useState } from "react";
import { ImageFallback, SecondaryButton } from "../../../shared/components";
import { DEFAULT_DRONE_CARD_IMAGE_PATH } from "../../../shared/constants";
import type { InterferenceTimelinePoint } from "../domain";
import "./report-components.css";

export type DroneViewTimelinePlayerProps = {
  timeline: InterferenceTimelinePoint[];
};

/** 재생 프레임 간격(ms) — 실제 표본 간격과 무관하게 일정 속도로 훑는다. */
const PLAYBACK_FRAME_MS = 700;

function formatClock(atMs: number) {
  return new Date(atMs).toLocaleTimeString("ko-KR", { hour12: false });
}

/**
 * 교란 구간 드론뷰 재생기 — 수집된 프레임 이미지를 시간 순서로 동영상처럼 넘겨 보고,
 * 슬라이더로 원하는 시점에 멈춰 그 시각의 좌표를 확인할 수 있다.
 */
export function DroneViewTimelinePlayer({
  timeline,
}: DroneViewTimelinePlayerProps) {
  // 이미지가 있는 지점만 재생 대상 프레임으로 쓴다(같은 이미지가 연속되면 하나로 접는다).
  const frames = useMemo(() => {
    const withImage = timeline.filter(
      (point): point is InterferenceTimelinePoint & { imageUrl: string } =>
        typeof point.imageUrl === "string" && point.imageUrl.length > 0,
    );
    const folded: (InterferenceTimelinePoint & { imageUrl: string })[] = [];
    for (const point of withImage) {
      if (folded[folded.length - 1]?.imageUrl !== point.imageUrl) {
        folded.push(point);
      }
    }
    return folded;
  }, [timeline]);

  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 재생: 일정 간격으로 다음 프레임으로 이동, 끝에 닿으면 정지.
  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }
    timerRef.current = setInterval(() => {
      setFrameIndex((current) => {
        if (current >= frames.length - 1) {
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, PLAYBACK_FRAME_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, frames.length]);

  if (frames.length === 0) {
    return (
      <p className="report-detail__content">재생할 드론뷰 프레임이 없습니다.</p>
    );
  }

  const frame = frames[Math.min(frameIndex, frames.length - 1)];

  const handleTogglePlay = () => {
    // 끝까지 본 뒤 다시 누르면 처음부터 재생한다.
    if (!isPlaying && frameIndex >= frames.length - 1) {
      setFrameIndex(0);
    }
    setIsPlaying((playing) => !playing);
  };

  return (
    <div className="report-player">
      <div className="report-player__screen">
        <ImageFallback
          className="report-player__image"
          src={frame.imageUrl}
          fallbackSrc={DEFAULT_DRONE_CARD_IMAGE_PATH}
          alt={`교란 구간 드론뷰 ${frameIndex + 1}/${frames.length}`}
        />
        <span className="report-player__stamp">
          {formatClock(frame.atMs)} · +{Math.round(frame.elapsedSeconds)}초
        </span>
      </div>
      <div className="report-player__controls">
        <SecondaryButton size="sm" onClick={handleTogglePlay}>
          {isPlaying ? "일시 정지" : "재생"}
        </SecondaryButton>
        <input
          className="report-player__slider"
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={Math.min(frameIndex, frames.length - 1)}
          aria-label="드론뷰 재생 위치"
          onChange={(event) => {
            setIsPlaying(false);
            setFrameIndex(Number(event.target.value));
          }}
        />
        <span className="report-player__counter">
          {Math.min(frameIndex, frames.length - 1) + 1}/{frames.length}
        </span>
      </div>
      <p className="report-player__coord">
        이 시점 좌표: {frame.position.latitude.toFixed(5)},{" "}
        {frame.position.longitude.toFixed(5)}
        {frame.gnssDivergenceMeters !== null
          ? ` · GNSS 불일치 ${frame.gnssDivergenceMeters.toFixed(1)}m`
          : " · GNSS 신호 없음"}
      </p>
    </div>
  );
}
