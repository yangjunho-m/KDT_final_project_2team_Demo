import { BaseButton, type BaseButtonProps } from "./BaseButton";

export type PrimaryButtonProps = Omit<BaseButtonProps, "variant">;

export function PrimaryButton(props: PrimaryButtonProps) {
  return <BaseButton variant="primary" {...props} />;
}
