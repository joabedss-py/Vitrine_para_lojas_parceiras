import { TRPCError } from "@trpc/server";
import type { Product } from "../drizzle/schema";
import * as db from "./db";
import { createHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";
import { ENV } from "./_core/env";
import { getMarketplaceProvider } from "./marketplaces/registry";
import { MarketplaceProviderError, type MarketplaceAvailability } from "./marketplaces/types";
import { logInternalError } from "./_core/errorLogging";
import {
  PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS,
  PRODUCT_MONITOR_SUCCESS_INTERVAL_MS,
  PRODUCT_MONITOR_WORKER_INTERVAL_MINUTES,
  canAutomaticallyRetryProductMonitor,
  productMonitorRetryDelayMs,
} from "../shared/product-monitor";

export const PRODUCT_MONITOR_JOB_NAME = "vitrineml-product-monitor";
export const PRODUCT_MONITOR_CALLBACK_PATH = "/api/scheduled/product-monitor";
export const PRODUCT_MONITOR_CRON = `0 */${PRODUCT_MONITOR_WORKER_INTERVAL_MINUTES} * * * *`;
const JOB_LEASE_MS = 10 * 60 * 1000;
const MAX_PRODUCTS_PER_RUN = 100;
const WORKER_CONCURRENCY = 4;

export type ProductMonitorResult = {
  productId: number;
  availabilityStatus: MarketplaceAvailability | "unknown";
  lastCheckedAt: Date;
  success: boolean;
};

function errorCode(error: unknown) {
  if (!(error instanceof MarketplaceProviderError)) return "unavailable";
  return error.code;
}

function nextRetryAt(error: unknown, failureCount: number, now: Date) {
  const providerDelay = error instanceof MarketplaceProviderError ? error.retryAfterMs ?? 0 : 0;
  return new Date(now.getTime() + productMonitorRetryDelayMs(failureCount, providerDelay));
}

function asPublicResult(productId: number, availabilityStatus: MarketplaceAvailability | "unknown", lastCheckedAt: Date): ProductMonitorResult {
  return { productId, availabilityStatus, lastCheckedAt, success: true };
}

async function fetchSnapshotWithRefresh(providerId: string, sourceUrl: string, accessToken: string) {
  const provider = getMarketplaceProvider(providerId);
  const itemId = provider.parseItemId(sourceUrl);
  try {
    return await provider.fetchSnapshot(itemId, accessToken);
  } catch (error) {
    if (!(error instanceof MarketplaceProviderError) || error.code !== "unauthorized") throw error;
    const refreshedToken = await provider.getAccessToken(accessToken);
    return provider.fetchSnapshot(itemId, refreshedToken);
  }
}

async function recordFailure(product: Product, error: unknown, now: Date): Promise<ProductMonitorResult> {
  const failureCount = Math.min(product.syncFailureCount + 1, PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS);
  const retriesExhausted = !canAutomaticallyRetryProductMonitor(failureCount);
  logInternalError(`Product monitor product=${product.id} provider=${product.sourceProvider}`, error);
  await db.updateProductMonitorFailure(
    product.id,
    retriesExhausted ? "max_retries" : errorCode(error),
    failureCount,
    retriesExhausted ? null : nextRetryAt(error, failureCount, now),
    now,
  );
  return { productId: product.id, availabilityStatus: product.availabilityStatus, lastCheckedAt: product.lastCheckedAt ?? now, success: false };
}

async function syncProductWithAccessToken(product: Product, accessToken: string): Promise<ProductMonitorResult> {
  const now = new Date();
  if (!product.monitorEnabled || !product.sourceUrl || product.sourceProvider === "manual") {
    const error = new MarketplaceProviderError("invalid_source", "Este produto não tem uma origem monitorável configurada.");
    return recordFailure(product, error, now);
  }

  try {
    const snapshot = await fetchSnapshotWithRefresh(product.sourceProvider, product.sourceUrl, accessToken);
    await db.updateProductMonitorSuccess(product.id, snapshot, now, new Date(now.getTime() + PRODUCT_MONITOR_SUCCESS_INTERVAL_MS));
    return asPublicResult(product.id, snapshot.availability, now);
  } catch (error) {
    if (error instanceof MarketplaceProviderError && error.code === "not_found") {
      await db.updateProductMonitorNotFound(product.id, now, new Date(now.getTime() + PRODUCT_MONITOR_SUCCESS_INTERVAL_MS));
      return asPublicResult(product.id, "unavailable", now);
    }
    return recordFailure(product, error, now);
  }
}

export async function syncProductNow(productId: number): Promise<ProductMonitorResult> {
  if (!ENV.isProduction) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A verificação manual fica disponível na versão publicada." });
  }
  const product = await db.getAdminProductById(productId);
  if (!product || !product.monitorEnabled) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Ative o monitoramento e salve o produto antes de verificar." });
  }
  if (!(await db.getMarketplaceConnection(product.sourceProvider))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte a conta da loja antes de verificar este produto." });
  }
  try {
    const provider = getMarketplaceProvider(product.sourceProvider);
    const accessToken = await provider.getAccessToken();
    return await syncProductWithAccessToken(product, accessToken);
  } catch (error) {
    return recordFailure(product, error, new Date());
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, handler: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await handler(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runDueProductChecks() {
  const now = new Date();
  const products = await db.listDueMonitorProducts(now, MAX_PRODUCTS_PER_RUN);
  if (products.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

  const productsByProvider = new Map<string, Product[]>();
  for (const product of products) {
    const group = productsByProvider.get(product.sourceProvider) ?? [];
    group.push(product);
    productsByProvider.set(product.sourceProvider, group);
  }

  const results: ProductMonitorResult[] = [];
  for (const [providerId, providerProducts] of productsByProvider) {
    let accessToken: string;
    try {
      accessToken = await getMarketplaceProvider(providerId).getAccessToken();
    } catch (error) {
      const failures = await mapWithConcurrency(providerProducts, WORKER_CONCURRENCY, product => recordFailure(product, error, now));
      results.push(...failures);
      continue;
    }
    results.push(...await mapWithConcurrency(providerProducts, WORKER_CONCURRENCY, product => syncProductWithAccessToken(product, accessToken)));
  }

  const succeeded = results.filter(result => result.success).length;
  return { processed: products.length, succeeded, failed: results.length - succeeded };
}

export async function isRegisteredProductMonitorTask(taskUid: string) {
  const job = await db.getScheduledJob(PRODUCT_MONITOR_JOB_NAME);
  return Boolean(job?.enabled && job.taskUid === taskUid);
}

export async function claimProductMonitorRun(taskUid: string) {
  return db.claimScheduledJobRun(PRODUCT_MONITOR_JOB_NAME, taskUid, new Date(), JOB_LEASE_MS);
}

export async function markProductMonitorRun(taskUid: string) {
  await db.markScheduledJobRun(PRODUCT_MONITOR_JOB_NAME, taskUid, new Date());
}

export async function configureProductMonitorSchedule() {
  if (!ENV.isProduction) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A rotina automática só pode ser ativada no site publicado." });
  }
  if (!(await db.getMarketplaceConnection("mercado_livre"))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte uma conta do Mercado Livre antes de ativar a rotina." });
  }

  const existing = await db.getScheduledJob(PRODUCT_MONITOR_JOB_NAME);
  let taskUid = existing?.taskUid;
  const job = {
    name: PRODUCT_MONITOR_JOB_NAME,
    cron: PRODUCT_MONITOR_CRON,
    path: PRODUCT_MONITOR_CALLBACK_PATH,
    method: "POST" as const,
    description: "Worker a cada 15 minutos; produtos confirmados são consultados a cada 6 horas e falhas recebem até 8 retentativas com backoff.",
  };

  if (!taskUid) {
    const listed = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
    const discoveredTaskUid = listed.jobs.find(candidate => candidate.name === PRODUCT_MONITOR_JOB_NAME)?.taskUid;
    if (discoveredTaskUid) taskUid = discoveredTaskUid;
  }

  if (taskUid) {
    await updateHeartbeatJob(taskUid, { cron: job.cron, path: job.path, method: job.method, description: job.description, enable: true }, "");
  } else {
    const created = await createHeartbeatJob(job, "");
    taskUid = created.taskUid;
  }
  await db.saveScheduledJob(PRODUCT_MONITOR_JOB_NAME, taskUid, PRODUCT_MONITOR_CRON, true);
  return { enabled: true };
}

export async function disableProductMonitorSchedule() {
  const job = await db.getScheduledJob(PRODUCT_MONITOR_JOB_NAME);
  if (!job) return { enabled: false };
  await updateHeartbeatJob(job.taskUid, { enable: false }, "");
  await db.setScheduledJobEnabled(PRODUCT_MONITOR_JOB_NAME, false);
  return { enabled: false };
}

export async function disconnectMercadoLivre() {
  await disableProductMonitorSchedule();
  await db.deleteMarketplaceConnection("mercado_livre");
  await db.resetProviderMonitoredProducts("mercado_livre");
  return { connected: false, scheduleEnabled: false };
}
