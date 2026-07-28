import { useEffect, type ReactNode } from "react";
import { useDraggable } from "../hooks";

export type ModalShellProps = {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
  /** 화면별로 더 넓은 폭 등이 필요할 때 추가하는 클래스 (예: 표가 많은 로그 모달) */
  className?: string;
};

/** 모든 모달은 헤더를 손잡이로 잡아 화면 안에서 옮길 수 있다. */
export function ModalShell({
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
  className,
}: ModalShellProps) {
  const { style: dragStyle, onDragHandlePointerDown } = useDraggable();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const modalClasses = [
    "ui-modal",
    wide ? "ui-modal--wide" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="ui-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={modalClasses}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={dragStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className="ui-modal__header"
          onPointerDown={onDragHandlePointerDown}
        >
          <div>
            <h2 className="ui-modal__title">{title}</h2>
            {description ? (
              <p className="ui-modal__description">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="ui-modal__close"
            aria-label="닫기"
            title="닫기"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="ui-modal__body">{children}</div>
        <footer className="ui-modal__footer">{footer}</footer>
      </div>
    </div>
  );
}
