export type BrandLogoProps = {
  size?: number;
  className?: string;
};

/** 드론 관제 서비스 브랜드 마크. (밝은 테마 인라인 SVG) */
export function BrandLogo({ size = 40, className }: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="드론 통합 관제 시스템 로고"
      className={className}
    >
      <path
        d="M24 3 42 13.5v21L24 45 6 34.5v-21Z"
        fill="var(--color-primary-soft)"
        stroke="var(--color-primary)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <g
        fill="none"
        stroke="var(--color-primary-strong)"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="17" cy="18" r="3.4" />
        <circle cx="31" cy="18" r="3.4" />
        <circle cx="17" cy="30" r="3.4" />
        <circle cx="31" cy="30" r="3.4" />
        <line x1="19.2" y1="20.2" x2="28.8" y2="27.8" />
        <line x1="28.8" y1="20.2" x2="19.2" y2="27.8" />
      </g>
      <circle cx="24" cy="24" r="3.2" fill="var(--color-primary)" />
    </svg>
  );
}
