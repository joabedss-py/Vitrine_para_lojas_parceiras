import sharp from "sharp";
import { TRPCError } from "@trpc/server";
import type { Product } from "../drizzle/schema";
import { formatMoneyBRL, multiplyPriceStringByCount } from "../shared/price";
import {
  WHATSAPP_ANNOUNCEMENT_MAX_ATTEMPTS,
  WHATSAPP_ANNOUNCEMENT_MAX_RETRY_MS,
  whatsappAnnouncementRetryDelayMs,
} from "../shared/whatsapp-announcement";
import * as db from "./db";
import { createHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";
import { ENV } from "./_core/env";
import { logInternalError } from "./_core/errorLogging";
import { storageGetSignedUrl } from "./storage";

export const WHATSAPP_ANNOUNCEMENTS_JOB_NAME = "vitrineml-whatsapp-announcements";
export const WHATSAPP_ANNOUNCEMENTS_CALLBACK_PATH = "/api/scheduled/whatsapp-announcements";
export const WHATSAPP_ANNOUNCEMENTS_CRON = "0 */5 * * * *";
export const WHATSAPP_SITE_ORIGIN = ENV.publicSiteOrigin;
const META_GRAPH_VERSION = "v26.0";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ANNOUNCEMENTS_PER_RUN = 20;
const ANNOUNCEMENT_CONCURRENCY = 3;
const ANNOUNCEMENT_LEASE_MS = 10 * 60 * 1000;
const JOB_LEASE_MS = 10 * 60 * 1000;

class WhatsAppApiError extends Error {
  constructor(readonly code: string, readonly retryAfterMs = 0) {
    super(`WhatsApp API request failed (${code})`);
    this.name = "WhatsAppApiError";
  }
}

function getWhatsAppConfig() {
  const accessToken = ENV.whatsappAccessToken.trim();
  const phoneNumberId = ENV.whatsappPhoneNumberId.trim();
  const groupId = ENV.whatsappGroupId.trim();
  if (!accessToken || !phoneNumberId || !groupId) return null;
  return { accessToken, phoneNumberId, groupId };
}

export function whatsappCredentialsConfigured() {
  return getWhatsAppConfig() !== null;
}

export function buildProductAnnouncementCaption(product: Product, productUrl: string) {
  const lines = [
    "📣 Produto novo na Vitrine",
    product.title,
    `À vista: ${formatMoneyBRL(String(product.price))}`,
  ];
  if (product.pixPrice) lines.push(`No Pix: ${formatMoneyBRL(String(product.pixPrice))}`);
  if (product.cardInstallmentPrice && product.installments) {
    const installment = `${product.installments}x de ${formatMoneyBRL(String(product.cardInstallmentPrice))}`;
    const interest = product.cardInterestFree === null ? "" : product.cardInterestFree ? " sem juros" : " com juros";
    const total = multiplyPriceStringByCount(String(product.cardInstallmentPrice), product.installments);
    lines.push(`${installment}${interest} (total ${formatMoneyBRL(total)})`);
  }
  if (product.listPrice) lines.push(`Preço original: ${formatMoneyBRL(String(product.listPrice))}`);
  if (product.shippingInfo) lines.push(product.shippingInfo);
  if (product.promotionInfo) lines.push(product.promotionInfo);
  lines.push(`Veja detalhes na Vitrine: ${productUrl}`);
  return lines.join("\n").slice(0, 1024);
}

export function buildGroupImageMessage(groupId: string, mediaId: string, caption: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "group",
    to: groupId,
    type: "image",
    image: { id: mediaId, caption },
  } as const;
}

export async function normalizeProductImageToJpeg(input: Buffer) {
  if (!input.length || input.length > MAX_IMAGE_BYTES) throw new WhatsAppApiError("image_size_invalid");
  let jpeg: Buffer;
  try {
    jpeg = await sharp(input, { limitInputPixels: 20_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (jpeg.length > MAX_IMAGE_BYTES) {
      jpeg = await sharp(input, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 68 })
        .toBuffer();
    }
  } catch {
    throw new WhatsAppApiError("image_conversion_failed");
  }
  if (!jpeg.length || jpeg.length > MAX_IMAGE_BYTES) throw new WhatsAppApiError("image_size_invalid");
  return jpeg;
}

function safeRetryAfterMs(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, WHATSAPP_ANNOUNCEMENT_MAX_RETRY_MS);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), WHATSAPP_ANNOUNCEMENT_MAX_RETRY_MS)) : 0;
}

async function readGraphResponse(response: Response) {
  const data = await response.json().catch(() => ({})) as {
    id?: string;
    messages?: Array<{ id?: string }>;
    error?: { code?: number | string };
  };
  if (!response.ok) {
    const providerCode = data.error?.code;
    const code = providerCode === undefined ? `http_${response.status}` : `meta_${String(providerCode).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)}`;
    throw new WhatsAppApiError(code, safeRetryAfterMs(response));
  }
  return data;
}

async function uploadProductImage(product: Product, accessToken: string, phoneNumberId: string) {
  const key = product.imageUrl.replace(/^\/manus-storage\//, "");
  if (!key || key.includes("..") || product.imageUrl === key) throw new WhatsAppApiError("invalid_image_path");
  const signedUrl = await storageGetSignedUrl(key);
  let imageResponse: Response;
  try {
    imageResponse = await fetch(signedUrl, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new WhatsAppApiError("image_fetch_failed");
  }
  if (!imageResponse.ok) throw new WhatsAppApiError(`image_http_${imageResponse.status}`);
  const input = Buffer.from(await imageResponse.arrayBuffer());
  const jpeg = await normalizeProductImageToJpeg(input);

  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", "image/jpeg");
  form.set("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "produto.jpg");

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new WhatsAppApiError("media_upload_network_error");
  }
  const uploaded = await readGraphResponse(uploadResponse);
  if (!uploaded.id) throw new WhatsAppApiError("media_id_missing");
  return uploaded.id;
}

async function sendGroupImage(product: Product, groupId: string, accessToken: string, phoneNumberId: string) {
  const mediaId = await uploadProductImage(product, accessToken, phoneNumberId);
    const productUrl = new URL(`/produto/${product.id}/`, WHATSAPP_SITE_ORIGIN).toString();
  const payload = buildGroupImageMessage(groupId, mediaId, buildProductAnnouncementCaption(product, productUrl));
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new WhatsAppApiError("message_network_error");
  }
  const sent = await readGraphResponse(response);
  const messageId = sent.messages?.[0]?.id;
  if (!messageId) throw new WhatsAppApiError("message_id_missing");
  return messageId;
}

async function deliverWhatsAppAnnouncement(announcementId: number): Promise<"sent" | "pending" | "failed" | "skipped"> {
  const config = getWhatsAppConfig();
  if (!ENV.isProduction || !config) return "skipped";
  const now = new Date();
  const claimed = await db.claimWhatsAppAnnouncement(
    announcementId,
    now,
    ANNOUNCEMENT_LEASE_MS,
    WHATSAPP_ANNOUNCEMENT_MAX_ATTEMPTS,
  );
  if (!claimed) return "skipped";

  const product = await db.getAdminProductById(claimed.productId);
  if (!product || !product.isActive) {
    await db.markWhatsAppAnnouncementFailure(announcementId, "product_unavailable", now, true);
    return "failed";
  }

  try {
    const messageId = await sendGroupImage(product, config.groupId, config.accessToken, config.phoneNumberId);
    await db.markWhatsAppAnnouncementSent(announcementId, messageId, new Date());
    return "sent";
  } catch (error) {
    logInternalError("WhatsApp product announcement", error);
    const retryAfterMs = error instanceof WhatsAppApiError ? error.retryAfterMs : 0;
    const errorCode = error instanceof WhatsAppApiError ? error.code : "unexpected_error";
    const permanentlyFailed = claimed.attemptCount >= WHATSAPP_ANNOUNCEMENT_MAX_ATTEMPTS;
    const retryDelay = whatsappAnnouncementRetryDelayMs(claimed.attemptCount, retryAfterMs);
    await db.markWhatsAppAnnouncementFailure(
      announcementId,
      errorCode,
      new Date(Date.now() + retryDelay),
      permanentlyFailed,
    );
    return permanentlyFailed ? "failed" : "pending";
  }
}

export async function announceNewProduct(announcementId: number) {
  return deliverWhatsAppAnnouncement(announcementId);
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

export async function runDueWhatsAppAnnouncements() {
  const due = await db.listDueWhatsAppAnnouncements(new Date(), MAX_ANNOUNCEMENTS_PER_RUN);
  const results = await mapWithConcurrency(due, ANNOUNCEMENT_CONCURRENCY, item => deliverWhatsAppAnnouncement(item.id));
  return {
    processed: results.filter(result => result !== "skipped").length,
    sent: results.filter(result => result === "sent").length,
    pending: results.filter(result => result === "pending").length,
    failed: results.filter(result => result === "failed").length,
  };
}

export async function isRegisteredWhatsAppAnnouncementsTask(taskUid: string) {
  const job = await db.getScheduledJob(WHATSAPP_ANNOUNCEMENTS_JOB_NAME);
  return Boolean(job?.enabled && job.taskUid === taskUid);
}

export async function claimWhatsAppAnnouncementsRun(taskUid: string) {
  return db.claimScheduledJobRun(WHATSAPP_ANNOUNCEMENTS_JOB_NAME, taskUid, new Date(), JOB_LEASE_MS);
}

export async function markWhatsAppAnnouncementsRun(taskUid: string) {
  await db.markScheduledJobRun(WHATSAPP_ANNOUNCEMENTS_JOB_NAME, taskUid, new Date());
}

export async function configureWhatsAppAnnouncementsSchedule() {
  if (!ENV.isProduction) throw new Error("WhatsApp retry scheduling is available only in the published site.");
  if (!whatsappCredentialsConfigured()) throw new Error("WhatsApp configuration is incomplete.");

  const existing = await db.getScheduledJob(WHATSAPP_ANNOUNCEMENTS_JOB_NAME);
  let taskUid: string | undefined = existing?.taskUid;
  const job = {
    name: WHATSAPP_ANNOUNCEMENTS_JOB_NAME,
    cron: WHATSAPP_ANNOUNCEMENTS_CRON,
    path: WHATSAPP_ANNOUNCEMENTS_CALLBACK_PATH,
    method: "POST" as const,
    description: "Processa retentativas de anúncios de produtos no grupo WhatsApp oficial a cada cinco minutos.",
  };
  if (!taskUid) {
    const listed = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
    taskUid = listed.jobs.find(candidate => candidate.name === WHATSAPP_ANNOUNCEMENTS_JOB_NAME)?.taskUid;
  }
  if (taskUid) {
    await updateHeartbeatJob(taskUid, {
      cron: job.cron,
      path: job.path,
      method: job.method,
      description: job.description,
      enable: true,
    }, "");
  } else {
    const created = await createHeartbeatJob(job, "");
    taskUid = created.taskUid;
  }
  if (!taskUid) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível preparar as retentativas do WhatsApp." });
  await db.saveScheduledJob(WHATSAPP_ANNOUNCEMENTS_JOB_NAME, taskUid, WHATSAPP_ANNOUNCEMENTS_CRON, true);
  return { enabled: true };
}

export async function disableWhatsAppAnnouncementsSchedule() {
  const job = await db.getScheduledJob(WHATSAPP_ANNOUNCEMENTS_JOB_NAME);
  if (!job) return { enabled: false };
  await updateHeartbeatJob(job.taskUid, { enable: false }, "");
  await db.setScheduledJobEnabled(WHATSAPP_ANNOUNCEMENTS_JOB_NAME, false);
  return { enabled: false };
}

export async function retryFailedWhatsAppAnnouncements() {
  if (!ENV.isProduction) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O reenvio fica disponível na versão publicada." });
  if (!whatsappCredentialsConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a integração do WhatsApp antes de reenviar." });
  await db.requeueFailedWhatsAppAnnouncements(new Date());
  return runDueWhatsAppAnnouncements();
}
