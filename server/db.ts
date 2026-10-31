import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { InsertProduct, InsertUser } from "../drizzle/schema";
import { products, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

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

export async function listProducts(filters: { search?: string; category?: string } = {}) {
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
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt), desc(products.id));
}

export async function listAdminProducts() {
  const db = await requireDb();
  return db.select().from(products).orderBy(desc(products.createdAt), desc(products.id));
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.isActive, true)))
    .limit(1);
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

export async function updateProduct(id: number, product: Omit<InsertProduct, "id" | "createdAt">) {
  const db = await requireDb();
  await db.update(products).set(product).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await requireDb();
  await db.delete(products).where(eq(products.id, id));
}
