import { BaseButton, type BaseButtonProps } from "./BaseButton";

export type SecondaryButtonProps = Omit<BaseButtonProps, "variant">;

export function SecondaryButton(props: SecondaryButtonProps) {
  return <BaseButton variant="secondary" {...props} />;
}
