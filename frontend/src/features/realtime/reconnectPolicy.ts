export type ReconnectPolicy = {
  enabled: boolean;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterRatio: number;
};

export const defaultReconnectPolicy: ReconnectPolicy = {
  enabled: true,
  maxAttempts: 5,
  initialDelayMs: 1_000,
  maxDelayMs: 15_000,
  backoffMultiplier: 1.8,
  jitterRatio: 0.2,
};

export function getReconnectDelayMs(
  policy: ReconnectPolicy,
  attempt: number,
): number {
  const exponentialDelay =
    policy.initialDelayMs * policy.backoffMultiplier ** Math.max(0, attempt - 1);
  const cappedDelay = Math.min(policy.maxDelayMs, exponentialDelay);
  const jitter = cappedDelay * policy.jitterRatio * (Math.random() * 2 - 1);

  return Math.max(0, Math.round(cappedDelay + jitter));
}
