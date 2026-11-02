export const PRODUCT_MONITOR_SUCCESS_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const PRODUCT_MONITOR_BASE_RETRY_MS = 15 * 60 * 1000;
export const PRODUCT_MONITOR_MAX_RETRY_MS = 24 * 60 * 60 * 1000;
export const PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS = 8;
export const PRODUCT_MONITOR_WORKER_INTERVAL_MINUTES = 15;
export const PRODUCT_MONITOR_PUBLIC_STATUS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type PublicProductAvailability = "available" | "out_of_stock" | "unavailable" | "unknown";

export function isValidObservedPrice(value: string | null | undefined): boolean {
  if (value == null || value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function shouldRecordPriceObservation(previousPrice: string | null | undefined, currentPrice: string): boolean {
  return isValidObservedPrice(currentPrice) && (previousPrice == null || previousPrice !== currentPrice);
}

export function shouldRecordAvailabilityTransition(
  previousStatus: "available" | "out_of_stock" | "unavailable" | null | undefined,
  currentStatus: "available" | "out_of_stock" | "unavailable",
): boolean {
  return previousStatus !== currentStatus;
}

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()) {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, PRODUCT_MONITOR_MAX_RETRY_MS);
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs) || dateMs <= nowMs) return undefined;
  return Math.min(dateMs - nowMs, PRODUCT_MONITOR_MAX_RETRY_MS);
}

export function getPublicProductAvailability(
  status: string | null | undefined,
  lastCheckedAt: Date | string | number | null | undefined,
  nowMs = Date.now(),
): PublicProductAvailability {
  if (status !== "available" && status !== "out_of_stock" && status !== "unavailable") return "unknown";
  if (lastCheckedAt === null || lastCheckedAt === undefined || lastCheckedAt === "") return "unknown";

  const checkedAtMs = lastCheckedAt instanceof Date
    ? lastCheckedAt.getTime()
    : new Date(lastCheckedAt).getTime();
  if (!Number.isFinite(checkedAtMs) || checkedAtMs > nowMs + 5 * 60 * 1000) return "unknown";
  if (nowMs - checkedAtMs > PRODUCT_MONITOR_PUBLIC_STATUS_STALE_AFTER_MS) return "unknown";

  return status;
}

export function canAutomaticallyRetryProductMonitor(failureCount: number) {
  return failureCount < PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS;
}

export function productMonitorRetryDelayMs(failureCount: number, providerRetryAfterMs = 0) {
  const attempt = Math.max(0, Math.min(Math.trunc(failureCount) - 1, PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS - 1));
  const backoff = Math.min(PRODUCT_MONITOR_BASE_RETRY_MS * (2 ** attempt), PRODUCT_MONITOR_MAX_RETRY_MS);
  const providerDelay = Number.isFinite(providerRetryAfterMs) && providerRetryAfterMs > 0 ? providerRetryAfterMs : 0;
  return Math.min(Math.max(backoff, providerDelay), PRODUCT_MONITOR_MAX_RETRY_MS);
}
