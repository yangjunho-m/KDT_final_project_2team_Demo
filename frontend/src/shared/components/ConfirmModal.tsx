import type { ReactNode } from "react";
import { ModalShell } from "./ModalShell";
import { PrimaryButton } from "./PrimaryButton";
import { DangerButton } from "./DangerButton";
import { SecondaryButton } from "./SecondaryButton";

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  tone = "primary",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!open) {
    return null;
  }

  const ConfirmButton = tone === "danger" ? DangerButton : PrimaryButton;

  return (
    <ModalShell
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>{cancelLabel}</SecondaryButton>
          <ConfirmButton onClick={onConfirm}>{confirmLabel}</ConfirmButton>
        </>
      }
    >
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>
        선택한 작업을 계속 진행하시겠습니까?
      </p>
    </ModalShell>
  );
}
