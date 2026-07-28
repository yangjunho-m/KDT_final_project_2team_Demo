import { useId, type SelectHTMLAttributes } from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
};

export function SelectInput({
  label,
  required = false,
  hint,
  error,
  options,
  placeholder,
  id,
  className,
  ...rest
}: SelectInputProps) {
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
      <select
        id={fieldId}
        className={controlClasses}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="ui-field__hint ui-field__hint--error">{error}</span>
      ) : hint ? (
        <span className="ui-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
