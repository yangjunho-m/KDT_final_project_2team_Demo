export type CoordinateDisplayProps = {
  latitude: number;
  longitude: number;
  altitude?: number;
  /** 위/경도(및 고도)를 세로로 배치한다. */
  stacked?: boolean;
  precision?: number;
};

export function CoordinateDisplay({
  latitude,
  longitude,
  altitude,
  stacked = false,
  precision = 5,
}: CoordinateDisplayProps) {
  const classes = ["ui-coordinate", stacked ? "ui-coordinate--stacked" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <span className="ui-coordinate__pair">
        <span className="ui-coordinate__axis">위도</span>
        <span>{latitude.toFixed(precision)}</span>
      </span>
      <span className="ui-coordinate__pair">
        <span className="ui-coordinate__axis">경도</span>
        <span>{longitude.toFixed(precision)}</span>
      </span>
      {altitude !== undefined ? (
        <span className="ui-coordinate__pair">
          <span className="ui-coordinate__axis">고도</span>
          <span>{Math.round(altitude)}m</span>
        </span>
      ) : null}
    </span>
  );
}
