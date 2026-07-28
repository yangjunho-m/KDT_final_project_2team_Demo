import { useId, type FormEvent, type ReactNode } from "react";
import { ModalShell } from "./ModalShell";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

export type FormModalProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  wide?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
};

export function FormModal({
  open,
  title,
  description,
  submitLabel = "저장",
  cancelLabel = "취소",
  submitDisabled = false,
  wide = false,
  onSubmit,
  onClose,
  children,
}: FormModalProps) {
  const formId = useId();

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <ModalShell
      title={title}
      description={description}
      onClose={onClose}
      wide={wide}
      footer={
        <>
          <SecondaryButton onClick={onClose}>{cancelLabel}</SecondaryButton>
          <PrimaryButton type="submit" form={formId} disabled={submitDisabled}>
            {submitLabel}
          </PrimaryButton>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="ui-form-grid">
        {children}
      </form>
    </ModalShell>
  );
}
