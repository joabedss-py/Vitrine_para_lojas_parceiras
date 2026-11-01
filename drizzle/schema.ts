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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    categoryIdx: index("products_category_idx").on(table.category),
    activeIdx: index("products_active_idx").on(table.isActive),
  }),
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
