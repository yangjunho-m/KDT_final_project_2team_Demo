import { CoordinateDisplay, StatusBadge } from "../../../shared/components";
import {
  formatEpisodeDuration,
  interferenceTypeLabel,
  type InterferenceEpisodeAnalysis,
} from "../domain";
import { DroneViewTimelinePlayer } from "./DroneViewTimelinePlayer";
import { InterferenceRangeMap } from "./InterferenceRangeMap";
import { InterferenceTrendChart } from "./InterferenceTrendChart";
import "./report-components.css";

export type InterferenceAnalysisPanelProps = {
  analysis: InterferenceEpisodeAnalysis;
};

function formatClock(atMs: number) {
  return new Date(atMs).toLocaleTimeString("ko-KR", { hour12: false });
}

/**
 * 교란 에피소드 상세 분석 — 보고 "상세 보기"에서만 보여준다.
 * (목록 카드는 훑어보는 용도라 요약 텍스트만 두고, 그래프·지도·재생기는 여기로 모은다)
 */
export function InterferenceAnalysisPanel({
  analysis,
}: InterferenceAnalysisPanelProps) {
  const range = analysis.rangeEstimate;

  return (
    <div className="report-analysis">
      <div className="report-analysis__head">
        <p className="report-detail__section-label">교란 분석</p>
        <div className="report-analysis__tags">
          <StatusBadge tone="neutral">
            {interferenceTypeLabel(analysis.interferenceType)}
          </StatusBadge>
        </div>
      </div>

      <div className="report-detail__grid">
        <div className="report-detail__meta-item">
          <span className="ui-coordinate__axis">시작 좌표</span>
          <CoordinateDisplay
            latitude={analysis.startPosition.latitude}
            longitude={analysis.startPosition.longitude}
          />
          <span className="report-analysis__hint">
            {formatClock(analysis.startedAtMs)}
          </span>
        </div>
        <div className="report-detail__meta-item">
          <span className="ui-coordinate__axis">종료 좌표</span>
          <CoordinateDisplay
            latitude={analysis.endPosition.latitude}
            longitude={analysis.endPosition.longitude}
          />
          <span className="report-analysis__hint">
            {formatClock(analysis.endedAtMs)}
          </span>
        </div>
        <div className="report-detail__meta-item">
          <span className="ui-coordinate__axis">교란 진행 시간</span>
          <span>{formatEpisodeDuration(analysis.durationMs)}</span>
        </div>
        <div className="report-detail__meta-item">
          <span className="ui-coordinate__axis">연계 드론</span>
          <span>{analysis.droneName}</span>
        </div>
      </div>

      <InterferenceTrendChart timeline={analysis.timeline} />

      <div>
        <p className="report-detail__section-label">교란 범위 예측</p>
        {range ? (
          <>
            <InterferenceRangeMap analysis={analysis} />
            <div className="report-detail__grid">
              <div className="report-detail__meta-item">
                <span className="ui-coordinate__axis">추정 중심</span>
                <CoordinateDisplay
                  latitude={range.center.latitude}
                  longitude={range.center.longitude}
                />
              </div>
              <div className="report-detail__meta-item">
                <span className="ui-coordinate__axis">추정 반경</span>
                <span>약 {Math.round(range.radiusMeters)}m</span>
              </div>
              <div className="report-detail__meta-item">
                <span className="ui-coordinate__axis">최대 / 평균 불일치</span>
                <span>
                  {range.peakErrorMeters.toFixed(1)}m /{" "}
                  {range.meanErrorMeters.toFixed(1)}m
                </span>
              </div>
              <div className="report-detail__meta-item">
                <span className="ui-coordinate__axis">분석 표본</span>
                <span>{range.sampleCount}건</span>
              </div>
            </div>
          </>
        ) : (
          <p className="report-detail__content">
            표본이 부족해 범위를 추정하지 못했습니다.
          </p>
        )}
        <p className="report-analysis__hint">
          관측된 교란 지점을 불일치 크기로 가중 평균한 중심과, 그 중심에서 관측된
          가장 먼 지점까지의 거리로 계산한 추정치입니다.
        </p>
      </div>

      <div>
        <p className="report-detail__section-label">교란 구간 드론뷰 재생</p>
        <DroneViewTimelinePlayer timeline={analysis.timeline} />
      </div>
    </div>
  );
}
