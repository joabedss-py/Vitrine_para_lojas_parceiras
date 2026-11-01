import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing the Manus OAuth flow and application permissions.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Public catalog items and their private editor-managed affiliate destinations. */
export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 80 }).notNull().default("Geral"),
    price: decimal("price", { precision: 65, scale: 2 }).notNull(),
    listPrice: decimal("listPrice", { precision: 65, scale: 2 }),
    pixPrice: decimal("pixPrice", { precision: 65, scale: 2 }),
    cardInstallmentPrice: decimal("cardInstallmentPrice", { precision: 65, scale: 2 }),
    installments: int("installments"),
    cardInterestFree: boolean("cardInterestFree"),
    storeName: varchar("storeName", { length: 120 }),
    shippingInfo: varchar("shippingInfo", { length: 180 }),
    promotionInfo: varchar("promotionInfo", { length: 180 }),
    imageUrl: text("imageUrl").notNull(),
    affiliateUrl: text("affiliateUrl").notNull(),
    isActive: boolean("isActive").notNull().default(true),
    sourceProvider: varchar("sourceProvider", { length: 40 }).notNull().default("manual"),
    sourceUrl: text("sourceUrl"),
    monitorEnabled: boolean("monitorEnabled").notNull().default(false),
    availabilityStatus: mysqlEnum("availabilityStatus", ["unknown", "available", "out_of_stock", "unavailable"]).notNull().default("unknown"),
    lastCheckedAt: timestamp("lastCheckedAt"),
    nextCheckAt: timestamp("nextCheckAt"),
    lastSyncError: varchar("lastSyncError", { length: 64 }),
    syncFailureCount: int("syncFailureCount").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    categoryIdx: index("products_category_idx").on(table.category),
    activeIdx: index("products_active_idx").on(table.isActive),
    monitorDueIdx: index("products_monitor_due_idx").on(table.monitorEnabled, table.nextCheckAt),
  }),
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

export const marketplaceConnections = mysqlTable("marketplace_connections", {
  provider: varchar("provider", { length: 40 }).primaryKey(),
  accountId: varchar("accountId", { length: 80 }).notNull(),
  accessTokenCiphertext: text("accessTokenCiphertext").notNull(),
  refreshTokenCiphertext: text("refreshTokenCiphertext").notNull(),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt").notNull(),
  scope: varchar("scope", { length: 255 }).notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketplaceConnection = typeof marketplaceConnections.$inferSelect;
export type InsertMarketplaceConnection = typeof marketplaceConnections.$inferInsert;

export const scheduledJobs = mysqlTable("scheduled_jobs", {
  name: varchar("name", { length: 80 }).primaryKey(),
  taskUid: varchar("taskUid", { length: 128 }).notNull(),
  cronExpression: varchar("cronExpression", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  leaseUntil: timestamp("leaseUntil"),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type InsertScheduledJob = typeof scheduledJobs.$inferInsert;

export const productPriceHistory = mysqlTable(
  "product_price_history",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    provider: varchar("provider", { length: 40 }).notNull(),
    previousPrice: decimal("previousPrice", { precision: 65, scale: 2 }).notNull(),
    currentPrice: decimal("currentPrice", { precision: 65, scale: 2 }).notNull(),
    checkedAt: timestamp("checkedAt").defaultNow().notNull(),
  },
  table => ({
    productCheckedIdx: index("product_price_history_product_checked_idx").on(table.productId, table.checkedAt),
  }),
);

export type ProductPriceHistory = typeof productPriceHistory.$inferSelect;
