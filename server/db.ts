import { and, asc, desc, eq, isNull, like, lt, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { InsertMarketplaceConnection, InsertProduct, InsertUser } from "../drizzle/schema";
import { marketplaceConnections, productPriceHistory, products, scheduledJobs, users, whatsappProductAnnouncements } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS } from "../shared/product-monitor";

let _db: ReturnType<typeof drizzle> | null = null;

/** Lazily initialize Drizzle so local tooling can inspect the project without a DB. */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const existing = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.openId, user.openId))
    .limit(1);
  const knownEmail = user.email ?? existing[0]?.email ?? null;
  const normalizedEmail = knownEmail?.trim().toLowerCase();
  const configuredAdminEmail = ENV.adminEmail.trim().toLowerCase();
  const isConfiguredAdmin =
    (Boolean(configuredAdminEmail) && normalizedEmail === configuredAdminEmail) ||
    (Boolean(ENV.ownerOpenId) && user.openId === ENV.ownerOpenId);

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (isConfiguredAdmin) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

const publicProductSelection = {
  id: products.id,
  title: products.title,
  description: products.description,
  category: products.category,
  price: products.price,
  listPrice: products.listPrice,
  pixPrice: products.pixPrice,
  cardInstallmentPrice: products.cardInstallmentPrice,
  installments: products.installments,
  cardInterestFree: products.cardInterestFree,
  storeName: products.storeName,
  shippingInfo: products.shippingInfo,
  promotionInfo: products.promotionInfo,
  imageUrl: products.imageUrl,
  affiliateUrl: products.affiliateUrl,
  monitorEnabled: products.monitorEnabled,
  availabilityStatus: products.availabilityStatus,
  lastCheckedAt: products.lastCheckedAt,
};

export async function listProducts(filters: {
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const db = await requireDb();
  const conditions = [eq(products.isActive, true)];
  if (filters.category) conditions.push(eq(products.category, filters.category));
  const term = filters.search?.trim();
  if (term) {
    const escaped = term.replace(/[\\%_]/g, "\\$&");
    const matchingText = or(
      like(products.title, `%${escaped}%`),
      like(products.description, `%${escaped}%`),
      like(products.category, `%${escaped}%`),
    );
    if (matchingText) conditions.push(matchingText);
  }
  return db
    .select(publicProductSelection)
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(filters.limit ?? 13)
    .offset(filters.offset ?? 0);
}

export async function listAdminProducts() {
  const db = await requireDb();
  return db.select().from(products).orderBy(desc(products.createdAt), desc(products.id));
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select(publicProductSelection).from(products).where(and(eq(products.id, id), eq(products.isActive, true))).limit(1);
  return result[0];
}

export async function getAdminProductById(id: number) {
  const db = await requireDb();
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function listProductCategories() {
  const db = await requireDb();
  const result = await db
    .select({ category: products.category })
    .from(products)
    .where(eq(products.isActive, true))
    .groupBy(products.category)
    .orderBy(asc(products.category));
  return result.map(row => row.category);
}

export async function createProduct(product: InsertProduct): Promise<number> {
  const db = await requireDb();
  const inserted = await db.insert(products).values(product).$returningId();
  const id = inserted[0]?.id;
  if (!id) throw new Error("Product insert did not return an id");
  return id;
}

export async function createProductWithChannelAnnouncement(product: InsertProduct, buildAnnouncementText: (productId: number) => string) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const inserted = await tx.insert(products).values(product).$returningId();
    const id = inserted[0]?.id;
    if (!id) throw new Error("Product insert did not return an id");
    if (product.isActive) {
      const now = new Date();
      await tx.insert(whatsappProductAnnouncements).values({
        productId: id,
        status: "prepared",
        announcementText: buildAnnouncementText(id),
        preparedAt: now,
        nextAttemptAt: now,
      });
    }
    return { id, announcementPrepared: product.isActive === true };
  });
}

export async function updateProductWithChannelAnnouncement(
  id: number,
  product: Omit<InsertProduct, "id" | "createdAt">,
  buildAnnouncementText: (productId: number) => string,
) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const [existingProduct] = await tx.select({ id: products.id }).from(products).where(eq(products.id, id)).for("update").limit(1);
    if (!existingProduct) throw new Error("Product not found");
    await tx.update(products).set(product).where(eq(products.id, id));
    const [announcement] = await tx.select().from(whatsappProductAnnouncements)
      .where(eq(whatsappProductAnnouncements.productId, id)).for("update").limit(1);
    if (announcement?.status === "published_manually") return;

    const now = new Date();
    if (!product.isActive) {
      if (announcement && announcement.status !== "cancelled") {
        await tx.update(whatsappProductAnnouncements).set({ status: "cancelled", lockedUntil: null })
          .where(eq(whatsappProductAnnouncements.id, announcement.id));
      }
      return;
    }

    const preparedFields = {
      status: "prepared" as const,
      announcementText: buildAnnouncementText(id),
      preparedAt: now,
      publishedManuallyAt: null,
      attemptCount: 0,
      nextAttemptAt: now,
      lockedUntil: null,
      lastErrorCode: null,
      providerMessageId: null,
      sentAt: null,
    };
    if (announcement) {
      await tx.update(whatsappProductAnnouncements).set(preparedFields)
        .where(eq(whatsappProductAnnouncements.id, announcement.id));
    } else {
      await tx.insert(whatsappProductAnnouncements).values({ productId: id, ...preparedFields });
    }
  });
}

export async function listPreparedChannelAnnouncements() {
  const db = await requireDb();
  return db.select({
    productId: products.id,
    title: products.title,
    description: products.description,
    price: products.price,
    listPrice: products.listPrice,
    pixPrice: products.pixPrice,
    cardInstallmentPrice: products.cardInstallmentPrice,
    installments: products.installments,
    cardInterestFree: products.cardInterestFree,
    shippingInfo: products.shippingInfo,
    promotionInfo: products.promotionInfo,
    imageUrl: products.imageUrl,
    status: whatsappProductAnnouncements.status,
    announcementText: whatsappProductAnnouncements.announcementText,
    preparedAt: whatsappProductAnnouncements.preparedAt,
    publishedManuallyAt: whatsappProductAnnouncements.publishedManuallyAt,
  })
    .from(whatsappProductAnnouncements)
    .innerJoin(products, eq(products.id, whatsappProductAnnouncements.productId))
    .where(and(
      eq(products.isActive, true),
      or(
        eq(whatsappProductAnnouncements.status, "prepared"),
        eq(whatsappProductAnnouncements.status, "published_manually"),
      ),
    ))
    .orderBy(desc(whatsappProductAnnouncements.preparedAt), desc(whatsappProductAnnouncements.id));
}

export async function markChannelAnnouncementPublished(productId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [product] = await tx.select({ isActive: products.isActive }).from(products)
      .where(eq(products.id, productId)).for("update").limit(1);
    if (!product) return "not_found" as const;
    if (!product.isActive) return "inactive" as const;
    const [announcement] = await tx.select().from(whatsappProductAnnouncements)
      .where(eq(whatsappProductAnnouncements.productId, productId)).for("update").limit(1);
    if (!announcement || announcement.status === "cancelled") return "not_prepared" as const;
    if (announcement.status === "published_manually") return "already_published" as const;
    if (announcement.status !== "prepared") return "not_prepared" as const;
    await tx.update(whatsappProductAnnouncements).set({
      status: "published_manually",
      publishedManuallyAt: new Date(),
      lockedUntil: null,
    }).where(eq(whatsappProductAnnouncements.id, announcement.id));
    return "published" as const;
  });
}

export async function deleteProduct(id: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(whatsappProductAnnouncements).where(eq(whatsappProductAnnouncements.productId, id));
    await tx.delete(productPriceHistory).where(eq(productPriceHistory.productId, id));
    await tx.delete(products).where(eq(products.id, id));
  });
}

export async function getMarketplaceConnection(provider: string) {
  const db = await requireDb();
  const result = await db.select().from(marketplaceConnections).where(eq(marketplaceConnections.provider, provider)).limit(1);
  return result[0];
}

export async function saveMarketplaceConnection(connection: InsertMarketplaceConnection) {
  const db = await requireDb();
  const now = new Date();
  await db.insert(marketplaceConnections).values({ ...connection, connectedAt: now, updatedAt: now }).onDuplicateKeyUpdate({
    set: {
      accountId: connection.accountId,
      accessTokenCiphertext: connection.accessTokenCiphertext,
      refreshTokenCiphertext: connection.refreshTokenCiphertext,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      scope: connection.scope,
      connectedAt: now,
      updatedAt: now,
    },
  });
}

export async function deleteMarketplaceConnection(provider: string) {
  const db = await requireDb();
  await db.delete(marketplaceConnections).where(eq(marketplaceConnections.provider, provider));
}

export async function resetProviderMonitoredProducts(provider: string) {
  const db = await requireDb();
  await db.update(products).set({
    availabilityStatus: "unknown",
    lastCheckedAt: null,
    nextCheckAt: null,
    lastSyncError: null,
    syncFailureCount: 0,
  }).where(eq(products.sourceProvider, provider));
}

export async function restartProviderMonitors(provider: string) {
  const db = await requireDb();
  await db.update(products).set({ syncFailureCount: 0, lastSyncError: null, nextCheckAt: new Date() })
    .where(and(eq(products.sourceProvider, provider), eq(products.monitorEnabled, true)));
}

export async function getScheduledJob(name: string) {
  const db = await requireDb();
  const result = await db.select().from(scheduledJobs).where(eq(scheduledJobs.name, name)).limit(1);
  return result[0];
}

export async function claimScheduledJobRun(name: string, taskUid: string, now: Date, leaseMs: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [job] = await tx.select({ taskUid: scheduledJobs.taskUid, enabled: scheduledJobs.enabled, leaseUntil: scheduledJobs.leaseUntil })
      .from(scheduledJobs).where(eq(scheduledJobs.name, name)).for("update").limit(1);
    if (!job || !job.enabled || job.taskUid !== taskUid || (job.leaseUntil && job.leaseUntil > now)) return false;
    await tx.update(scheduledJobs).set({ leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now })
      .where(and(eq(scheduledJobs.name, name), eq(scheduledJobs.taskUid, taskUid), eq(scheduledJobs.enabled, true)));
    return true;
  });
}

export async function saveScheduledJob(name: string, taskUid: string, cronExpression: string, enabled = true) {
  const db = await requireDb();
  const now = new Date();
  await db.insert(scheduledJobs).values({ name, taskUid, cronExpression, enabled, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({
    set: { taskUid, cronExpression, enabled, updatedAt: now },
  });
}

export async function setScheduledJobEnabled(name: string, enabled: boolean) {
  const db = await requireDb();
  await db.update(scheduledJobs).set({ enabled, updatedAt: new Date() }).where(eq(scheduledJobs.name, name));
}

export async function markScheduledJobRun(name: string, taskUid: string, lastRunAt: Date) {
  const db = await requireDb();
  await db.update(scheduledJobs).set({ lastRunAt, leaseUntil: null, updatedAt: lastRunAt })
    .where(and(eq(scheduledJobs.name, name), eq(scheduledJobs.taskUid, taskUid)));
}

export async function listDueMonitorProducts(now: Date, limit = 200) {
  const db = await requireDb();
  return db.select().from(products)
    .where(and(
      eq(products.monitorEnabled, true),
      lt(products.syncFailureCount, PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS),
      or(isNull(products.nextCheckAt), lte(products.nextCheckAt, now)),
    ))
    .orderBy(asc(products.nextCheckAt), asc(products.id))
    .limit(limit);
}

export async function updateProductMonitorSuccess(
  id: number,
  snapshot: { provider: string; price: string; listPrice?: string | null; availability: "available" | "out_of_stock" | "unavailable" },
  checkedAt: Date,
  nextCheckAt: Date,
) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const existing = await tx.select({ price: products.price }).from(products)
      .where(and(eq(products.id, id), or(isNull(products.lastCheckedAt), lte(products.lastCheckedAt, checkedAt))))
      .for("update").limit(1);
    if (!existing[0]) return;
    if (String(existing[0].price) !== snapshot.price) {
      await tx.insert(productPriceHistory).values({
        productId: id,
        provider: snapshot.provider,
        previousPrice: String(existing[0].price),
        currentPrice: snapshot.price,
        checkedAt,
      });
    }
    await tx.update(products).set({
      price: snapshot.price,
      ...(snapshot.listPrice !== undefined ? { listPrice: snapshot.listPrice } : {}),
      availabilityStatus: snapshot.availability,
      lastCheckedAt: checkedAt,
      nextCheckAt,
      lastSyncError: null,
      syncFailureCount: 0,
    }).where(eq(products.id, id));
  });
}

export async function updateProductMonitorNotFound(id: number, checkedAt: Date, nextCheckAt: Date) {
  const db = await requireDb();
  await db.update(products).set({
    availabilityStatus: "unavailable",
    lastCheckedAt: checkedAt,
    nextCheckAt,
    lastSyncError: null,
    syncFailureCount: 0,
  }).where(and(eq(products.id, id), or(isNull(products.lastCheckedAt), lte(products.lastCheckedAt, checkedAt))));
}

export async function updateProductMonitorFailure(
  id: number,
  errorCode: string,
  failureCount: number,
  nextCheckAt: Date | null,
  checkedAt: Date,
) {
  const db = await requireDb();
  await db.update(products).set({
    nextCheckAt,
    lastSyncError: errorCode,
    syncFailureCount: failureCount,
  }).where(and(eq(products.id, id), or(isNull(products.lastCheckedAt), lte(products.lastCheckedAt, checkedAt))));
}
