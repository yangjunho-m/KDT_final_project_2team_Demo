import { useRef } from "react";
import type { Target } from "../../../shared/types";
import "./target-components.css";

export type PlacedTargetListProps = {
  targets: Target[];
  disabled?: boolean;
  uploadingTargetId?: string | null;
  onUploadImage: (targetId: string, file: File) => void;
  onRemove: (targetId: string) => void;
};

/**
 * 시나리오에서 배치한 표적 관리 목록.
 * 표적별 이미지(드론 촬영 시뮬 정답 이미지)를 첨부하면
 * 관제 화면에서 발견 시 해당 이미지가 함께 표시된다.
 */
export function PlacedTargetList({
  targets,
  disabled = false,
  uploadingTargetId = null,
  onUploadImage,
  onRemove,
}: PlacedTargetListProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTargetIdRef = useRef<string | null>(null);

  if (targets.length === 0) {
    return null;
  }

  const openFilePicker = (targetId: string) => {
    pendingTargetIdRef.current = targetId;
    fileInputRef.current?.click();
  };

  return (
    <div className="placed-targets">
      <span className="placed-targets__title">배치된 표적 {targets.length}</span>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpg,image/jpeg,image/svg+xml"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const targetId = pendingTargetIdRef.current;
          pendingTargetIdRef.current = null;
          event.target.value = "";
          if (file && targetId) {
            onUploadImage(targetId, file);
          }
        }}
      />
      <ul className="placed-targets__list">
        {targets.map((target) => (
          <li key={target.id} className="placed-targets__row">
            {target.imageUrl ? (
              <img
                className="placed-targets__thumb"
                src={target.imageUrl}
                alt={`${target.name} 이미지`}
              />
            ) : (
              <span className="placed-targets__thumb placed-targets__thumb--empty">
                ◇
              </span>
            )}
            <span className="placed-targets__name">{target.name}</span>
            <button
              type="button"
              className="placed-targets__btn"
              disabled={disabled || uploadingTargetId === target.id}
              onClick={() => openFilePicker(target.id)}
            >
              {uploadingTargetId === target.id
                ? "업로드 중..."
                : target.imageUrl
                  ? "이미지 변경"
                  : "이미지 첨부"}
            </button>
            <button
              type="button"
              className="placed-targets__btn placed-targets__btn--danger"
              disabled={disabled}
              onClick={() => onRemove(target.id)}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
