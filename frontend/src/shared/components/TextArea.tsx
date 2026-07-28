import { useId, type TextareaHTMLAttributes } from "react";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
};

export function TextArea({
  label,
  required = false,
  hint,
  error,
  id,
  className,
  rows = 4,
  ...rest
}: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const controlClasses = [
    "ui-field__control",
    "ui-field__control--textarea",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-field">
      {label ? (
        <label className="ui-field__label" htmlFor={fieldId}>
          {label}
          {required ? <span className="ui-field__required">*</span> : null}
        </label>
      ) : null}
      <textarea
        id={fieldId}
        rows={rows}
        className={controlClasses}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? (
        <span className="ui-field__hint ui-field__hint--error">{error}</span>
      ) : hint ? (
        <span className="ui-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
