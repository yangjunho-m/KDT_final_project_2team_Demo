import { useId, type InputHTMLAttributes } from "react";

export type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  unit?: string;
};

export function NumberInput({
  label,
  required = false,
  hint,
  error,
  unit,
  id,
  className,
  ...rest
}: NumberInputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const controlClasses = ["ui-field__control", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-field">
      {label ? (
        <label className="ui-field__label" htmlFor={fieldId}>
          {label}
          {required ? <span className="ui-field__required">*</span> : null}
          {unit ? ` (${unit})` : null}
        </label>
      ) : null}
      <input
        id={fieldId}
        type="number"
        inputMode="decimal"
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
