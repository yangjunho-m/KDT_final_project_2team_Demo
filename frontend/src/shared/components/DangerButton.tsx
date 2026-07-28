import { BaseButton, type BaseButtonProps } from "./BaseButton";

export type DangerButtonProps = Omit<BaseButtonProps, "variant">;

export function DangerButton(props: DangerButtonProps) {
  return <BaseButton variant="danger" {...props} />;
}
