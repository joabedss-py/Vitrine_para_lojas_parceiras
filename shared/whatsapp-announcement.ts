export const WHATSAPP_ANNOUNCEMENT_MAX_ATTEMPTS = 8;
export const WHATSAPP_ANNOUNCEMENT_BASE_RETRY_MS = 5 * 60 * 1000;
export const WHATSAPP_ANNOUNCEMENT_MAX_RETRY_MS = 6 * 60 * 60 * 1000;

export function whatsappAnnouncementRetryDelayMs(attemptCount: number, retryAfterMs = 0) {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 16));
  const exponential = Math.min(
    WHATSAPP_ANNOUNCEMENT_BASE_RETRY_MS * 2 ** exponent,
    WHATSAPP_ANNOUNCEMENT_MAX_RETRY_MS,
  );
  return Math.min(Math.max(exponential, retryAfterMs), WHATSAPP_ANNOUNCEMENT_MAX_RETRY_MS);
}
