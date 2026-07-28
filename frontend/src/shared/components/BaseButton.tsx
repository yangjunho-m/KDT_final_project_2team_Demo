import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export type BaseButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: ButtonVariant;
  block?: boolean;
  size?: "md" | "sm";
};

export function BaseButton({
  variant,
  block = false,
  size = "md",
  type = "button",
  className,
  children,
  ...rest
}: BaseButtonProps) {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    size === "sm" ? "ui-btn--sm" : "",
    block ? "ui-btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
