import { useId, type InputHTMLAttributes } from "react";

export type TextInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  type?: "text" | "password" | "email" | "search";
};

export function TextInput({
  label,
  required = false,
  hint,
  error,
  id,
  className,
  type = "text",
  ...rest
}: TextInputProps) {
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
        </label>
      ) : null}
      <input
        id={fieldId}
        type={type}
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
