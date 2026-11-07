export type ProductMonitorSettings = {
  sourceProvider: string;
  sourceUrl: string | null;
  monitorEnabled: boolean;
};

export function buildProductMonitorSettingsPatch(
  current: ProductMonitorSettings,
  next: ProductMonitorSettings,
  resumeNow = false,
  now = new Date(),
) {
  const sourceChanged = current.sourceProvider !== next.sourceProvider || current.sourceUrl !== next.sourceUrl;
  const enabledChanged = current.monitorEnabled !== next.monitorEnabled;
  if (!sourceChanged && !enabledChanged && !resumeNow) return null;

  const resetAvailability = sourceChanged || (enabledChanged && next.monitorEnabled);
  return {
    sourceProvider: next.sourceProvider,
    sourceUrl: next.sourceUrl,
    monitorEnabled: next.monitorEnabled,
    ...(resetAvailability ? { availabilityStatus: "unknown" as const, lastCheckedAt: null } : {}),
    nextCheckAt: next.monitorEnabled ? now : null,
    lastSyncError: null,
    syncFailureCount: 0,
  };
}
