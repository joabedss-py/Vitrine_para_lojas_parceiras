import { describe, expect, it } from "vitest";
import { analyzeCommercialHistory } from "../shared/commercial-intelligence";
import {
  isValidObservedPrice,
  parseRetryAfterMs,
  shouldRecordAvailabilityTransition,
  shouldRecordPriceObservation,
} from "../shared/product-monitor";
import {
  canAutomaticallyRetryProductMonitor,
  getPublicProductAvailability,
  productMonitorRetryDelayMs,
  PRODUCT_MONITOR_BASE_RETRY_MS,
  PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS,
  PRODUCT_MONITOR_MAX_RETRY_MS,
  PRODUCT_MONITOR_PUBLIC_STATUS_STALE_AFTER_MS,
  PRODUCT_MONITOR_SUCCESS_INTERVAL_MS,
  PRODUCT_MONITOR_WORKER_INTERVAL_MINUTES,
} from "../shared/product-monitor";

describe("product monitor retry policy", () => {
  it("parses Retry-After seconds and HTTP dates while rejecting invalid or past values", () => {
    const now = Date.parse("2026-11-02T12:00:00.000Z");
    expect(parseRetryAfterMs("30", now)).toBe(30_000);
    expect(parseRetryAfterMs("Mon, 02 Nov 2026 12:01:00 GMT", now)).toBe(60_000);
    expect(parseRetryAfterMs("not-a-date", now)).toBeUndefined();
    expect(parseRetryAfterMs("Mon, 02 Nov 2026 11:59:00 GMT", now)).toBeUndefined();
  });

  it("checks products every six hours while the worker wakes every fifteen minutes", () => {
    expect(PRODUCT_MONITOR_SUCCESS_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    expect(PRODUCT_MONITOR_WORKER_INTERVAL_MINUTES).toBe(15);
  });

  it("uses exponential backoff and honors a provider Retry-After without exceeding one day", () => {
    expect(productMonitorRetryDelayMs(1)).toBe(PRODUCT_MONITOR_BASE_RETRY_MS);
    expect(productMonitorRetryDelayMs(2)).toBe(2 * PRODUCT_MONITOR_BASE_RETRY_MS);
    expect(productMonitorRetryDelayMs(4, 3 * 60 * 60 * 1000)).toBe(3 * 60 * 60 * 1000);
    expect(productMonitorRetryDelayMs(8)).toBe(PRODUCT_MONITOR_MAX_RETRY_MS);
    expect(productMonitorRetryDelayMs(2, 3 * PRODUCT_MONITOR_MAX_RETRY_MS)).toBe(PRODUCT_MONITOR_MAX_RETRY_MS);
  });

  it("pauses automatic retries after the configured maximum number of failures", () => {
    expect(canAutomaticallyRetryProductMonitor(PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS - 1)).toBe(true);
    expect(canAutomaticallyRetryProductMonitor(PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS)).toBe(false);
  });
});

describe("history recording policy", () => {
  it("accepts only positive observed prices and records first or changed observations", () => {
    expect(isValidObservedPrice("19.90")).toBe(true);
    expect(isValidObservedPrice("0")).toBe(false);
    expect(isValidObservedPrice("-1")).toBe(false);
    expect(isValidObservedPrice(null)).toBe(false);
    expect(shouldRecordPriceObservation(null, "19.90")).toBe(true);
    expect(shouldRecordPriceObservation("19.90", "19.90")).toBe(false);
    expect(shouldRecordPriceObservation("19.90", "20.90")).toBe(true);
    expect(shouldRecordPriceObservation("19.90", "-1")).toBe(false);
  });

  it("records only confirmed availability transitions and deduplicates consecutive states", () => {
    expect(shouldRecordAvailabilityTransition(null, "available")).toBe(true);
    expect(shouldRecordAvailabilityTransition("available", "available")).toBe(false);
    expect(shouldRecordAvailabilityTransition("available", "unavailable")).toBe(true);
    expect(shouldRecordAvailabilityTransition("unavailable", "out_of_stock")).toBe(true);
  });
});

describe("public product availability freshness", () => {
  const now = Date.parse("2026-11-01T12:00:00.000Z");

  it("keeps a recent confirmed status", () => {
    expect(getPublicProductAvailability("available", new Date(now - 6 * 60 * 60 * 1000), now)).toBe("available");
    expect(getPublicProductAvailability("out_of_stock", new Date(now - 1_000), now)).toBe("out_of_stock");
    expect(getPublicProductAvailability("unavailable", new Date(now - 1_000), now)).toBe("unavailable");
  });

  it("downgrades an absent or older-than-24-hours result to unconfirmed", () => {
    expect(PRODUCT_MONITOR_PUBLIC_STATUS_STALE_AFTER_MS).toBe(24 * 60 * 60 * 1000);
    expect(getPublicProductAvailability("available", null, now)).toBe("unknown");
    expect(getPublicProductAvailability("out_of_stock", new Date(now - PRODUCT_MONITOR_PUBLIC_STATUS_STALE_AFTER_MS - 1), now)).toBe("unknown");
    expect(getPublicProductAvailability("unknown", new Date(now - 1_000), now)).toBe("unknown");
  });

  it("does not trust invalid or implausibly future timestamps", () => {
    expect(getPublicProductAvailability("available", "not-a-date", now)).toBe("unknown");
    expect(getPublicProductAvailability("available", new Date(now + 10 * 60 * 1000), now)).toBe("unknown");
  });
});

describe("commercial intelligence", () => {
  const commercialNow = new Date("2026-11-02T12:00:00.000Z");
  const observation = (daysAgo: number, price: string) => ({ currentPrice: price, checkedAt: new Date(commercialNow.getTime() - daysAgo * 86_400_000) });

  it("classifies a meaningful price drop only with sufficient history", () => {
    const stats = analyzeCommercialHistory([
      observation(30, "100"),
      observation(15, "100"),
      observation(0, "80"),
    ], commercialNow);
    expect(stats?.classification).toBe("good_offer");
    expect(stats?.observationCount).toBe(3);
    expect(stats?.periods[30]?.variationPercent).toBeLessThan(0);
  });

  it("does not classify sparse history as an offer", () => {
    const stats = analyzeCommercialHistory([observation(1, "80"), observation(0, "80")], commercialNow);
    expect(stats?.classification).toBe("insufficient_history");
    expect(stats?.justification).toContain("Histórico insuficiente");
  });
});
