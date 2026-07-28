import { useState, type ImgHTMLAttributes } from "react";

export type ImageFallbackProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  src?: string | null;
  fallbackSrc: string;
  alt: string;
};

/**
 * 이미지가 없거나 로딩에 실패하면 기본 이미지로 대체한다.
 * SVG 원문을 직접 삽입하지 않고 항상 검증된 URL을 <img src>로 사용한다.
 */
export function ImageFallback({
  src,
  fallbackSrc,
  alt,
  className,
  ...rest
}: ImageFallbackProps) {
  // 어떤 URL이 로딩에 실패했는지만 기록하고, 표시할 src는 렌더 중에 계산한다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const resolvedSrc = src?.trim() ? src : fallbackSrc;
  const displaySrc = failedSrc === resolvedSrc ? fallbackSrc : resolvedSrc;

  const classes = ["ui-image", className ?? ""].filter(Boolean).join(" ");

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={classes}
      loading="lazy"
      onError={() => {
        if (displaySrc !== fallbackSrc) {
          setFailedSrc(resolvedSrc);
        }
      }}
      {...rest}
    />
  );
}
