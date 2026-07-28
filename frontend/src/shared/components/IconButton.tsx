import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
};

export function IconButton({
  label,
  icon,
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  const classes = ["ui-icon-btn", className ?? ""].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      {...rest}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
