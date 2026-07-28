import type { InterferenceTimelinePoint } from "../domain";
import "./report-components.css";

export type InterferenceTrendChartProps = {
  timeline: InterferenceTimelinePoint[];
};

// 시리즈 색 — 파랑: GNSS–독립 위치 차이, 초록: 채택 경로의 계획경로 이탈
const SERIES = {
  gnss: { color: "#3b82f6", label: "GNSS–독립 위치 차이" },
  path: { color: "#10b981", label: "채택 경로의 추정 횡방향 이탈" },
} as const;

const VIEW_WIDTH = 560;
const VIEW_HEIGHT = 230;
const PADDING = { top: 14, right: 14, bottom: 30, left: 46 };

type SeriesPoint = { x: number; y: number };

/** 꺾임을 완만하게 잇는 단순 스플라인(Catmull-Rom → Bezier) 경로 문자열 */
function smoothPath(points: SeriesPoint[]): string {
  if (points.length === 0) {
    return "";
  }
  if (points.length < 3) {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
  }
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * 항법 신뢰성과 임무 경로 영향 — 위치 기록 시계열로 그리는 2선 추이 그래프.
 * 파랑: GNSS와 독립 위치추정(INS/보정) 사이의 불일치(m).
 * 초록: 실제 항법에 채택된 경로가 계획경로에서 벗어난 정도(m).
 * 외부 차트 라이브러리 없이 인라인 SVG로 그린다(이 저장소의 그래픽 관례).
 */
export function InterferenceTrendChart({ timeline }: InterferenceTrendChartProps) {
  const gnssPoints = timeline.filter((p) => p.gnssDivergenceMeters !== null);
  const pathPoints = timeline.filter((p) => p.pathDeviationMeters !== null);
  if (gnssPoints.length === 0 && pathPoints.length === 0) {
    return (
      <p className="report-detail__content">표시할 추이 표본이 없습니다.</p>
    );
  }

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const maxElapsed = Math.max(...timeline.map((p) => p.elapsedSeconds), 1);
  const maxValue = Math.max(
    ...gnssPoints.map((p) => p.gnssDivergenceMeters as number),
    ...pathPoints.map((p) => p.pathDeviationMeters as number),
    1,
  );
  // 축 상한은 살짝 여유를 줘 곡선이 프레임에 붙지 않게 한다.
  const yMax = maxValue * 1.15;

  const toX = (elapsedSeconds: number) =>
    PADDING.left + (elapsedSeconds / maxElapsed) * plotWidth;
  const toY = (meters: number) =>
    PADDING.top + plotHeight - (meters / yMax) * plotHeight;

  const gnssPath = smoothPath(
    gnssPoints.map((p) => ({
      x: toX(p.elapsedSeconds),
      y: toY(p.gnssDivergenceMeters as number),
    })),
  );
  const pathPath = smoothPath(
    pathPoints.map((p) => ({
      x: toX(p.elapsedSeconds),
      y: toY(p.pathDeviationMeters as number),
    })),
  );

  // Y축 눈금 4단계(0 포함), X축 눈금 ~6개
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => r * yMax);
  const xTickCount = Math.min(6, Math.max(2, Math.round(maxElapsed / 15)));
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) =>
    (i / xTickCount) * maxElapsed,
  );

  return (
    <div className="report-trend">
      <p className="report-trend__title">항법 신뢰성과 임무 경로 영향</p>
      <p className="report-analysis__hint">
        GNSS와 독립 위치추정 사이의 불일치와, 실제 항법에 채택한 경로의 계획경로
        이탈을 함께 봅니다.
      </p>
      <svg
        className="report-trend__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`항법 추이 그래프 — 최대 불일치 ${Math.round(maxValue)}m, 관측 ${Math.round(maxElapsed)}초`}
      >
        {/* 가로 그리드 + Y축 라벨 */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PADDING.left}
              y1={toY(v)}
              x2={PADDING.left + plotWidth}
              y2={toY(v)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 6}
              y={toY(v) + 3}
              textAnchor="end"
              fontSize="9"
              fill="#64748b"
            >
              {Math.round(v)}m
            </text>
          </g>
        ))}
        {/* X축 눈금 */}
        {xTicks.map((v) => (
          <text
            key={v}
            x={toX(v)}
            y={VIEW_HEIGHT - 10}
            textAnchor="middle"
            fontSize="9"
            fill="#64748b"
          >
            {Math.round(v)}초
          </text>
        ))}

        {pathPath ? (
          <path d={pathPath} fill="none" stroke={SERIES.path.color} strokeWidth="2.2" />
        ) : null}
        {gnssPath ? (
          <path d={gnssPath} fill="none" stroke={SERIES.gnss.color} strokeWidth="2.2" />
        ) : null}
      </svg>
      <div className="report-trend__legend">
        <span className="report-trend__legend-item">
          <span
            className="report-trend__legend-dot"
            style={{ background: SERIES.gnss.color }}
          />
          {SERIES.gnss.label}
        </span>
        <span className="report-trend__legend-item">
          <span
            className="report-trend__legend-dot"
            style={{ background: SERIES.path.color }}
          />
          {SERIES.path.label}
        </span>
      </div>
      <p className="report-scatter__caption">
        위치 기록의 시간 동기화된 좌표 로그로 계산한 실측 값입니다. GNSS가 크게
        벌어져도 채택 경로가 계획경로를 유지했다면 임무 영향은 제한적입니다.
      </p>
    </div>
  );
}
