import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { comparePriceStrings, isValidPriceString, normalizePriceString } from "../shared/price";
import { storagePut } from "./storage";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { logInternalError } from "./_core/errorLogging";
import { startMercadoLivreOAuth } from "./_core/marketplaceOAuth";
import { configureProductMonitorSchedule, disableProductMonitorSchedule, disconnectMercadoLivre as disconnectMercadoLivreConnection, syncProductNow } from "./productMonitor";
import { getMarketplaceProvider, listMarketplaceProviders } from "./marketplaces/registry";
import { mercadoLivreCredentialsConfigured } from "./marketplaces/mercadoLivreOAuth";
import { adminProcedure, isAdminAuthorized, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

const priceInput = z.string().trim()
  .refine(isValidPriceString, "Informe um preço positivo com até 63 dígitos, até duas casas decimais e separadores de milhar válidos.")
  .transform(normalizePriceString);
const optionalPriceInput = z.union([z.literal(""), z.null(), priceInput])
  .transform(value => value === "" ? null : value);

function isSecureAffiliateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const productFieldsBase = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().min(1).max(6000).refine(value => value.trim().length > 0, "Informe uma descrição."),
  category: z.string().trim().min(1).max(80),
  price: priceInput,
  listPrice: optionalPriceInput,
  pixPrice: optionalPriceInput,
  cardInstallmentPrice: optionalPriceInput,
  installments: z.number().int().min(1).max(48).nullable(),
  cardInterestFree: z.boolean().nullable(),
  storeName: z.union([z.string().trim().max(120), z.null()]),
  shippingInfo: z.union([z.string().trim().max(180), z.null()]),
  promotionInfo: z.union([z.string().trim().max(180), z.null()]),
  imageUrl: z.string().min(1).max(1000).refine(isProductImagePath, "Imagem inválida"),
  affiliateUrl: z.string().url().max(2048).refine(isSecureAffiliateUrl, "Use um link HTTPS válido da loja ou da plataforma de afiliados."),
  isActive: z.boolean(),
  sourceProvider: z.string().trim().min(1).max(40).default("manual"),
  sourceUrl: z.union([z.string().trim().max(2048), z.literal(""), z.null()]).transform(value => value || null).default(null),
  monitorEnabled: z.boolean().default(false),
});

function validateProductPricing(
  fields: Pick<z.output<typeof productFieldsBase>, "price" | "listPrice" | "cardInstallmentPrice" | "installments" | "cardInterestFree">,
  context: z.RefinementCtx,
) {
  if (fields.listPrice && comparePriceStrings(fields.listPrice, fields.price) <= 0) {
    context.addIssue({ code: "custom", path: ["listPrice"], message: "O preço original deve ser maior que o preço à vista." });
  }
  if ((fields.cardInstallmentPrice === null) !== (fields.installments === null)) {
    context.addIssue({ code: "custom", path: ["installments"], message: "Informe o valor por parcela e a quantidade de parcelas juntos." });
  }
  if (fields.cardInstallmentPrice === null && fields.cardInterestFree !== null) {
    context.addIssue({ code: "custom", path: ["cardInterestFree"], message: "Informe os juros somente quando cadastrar as parcelas do cartão." });
  }
}

function validateProductMonitor(
  fields: Pick<z.output<typeof productFieldsBase>, "sourceProvider" | "sourceUrl" | "monitorEnabled">,
  context: z.RefinementCtx,
) {
  if (!fields.monitorEnabled) return;
  if (fields.sourceProvider === "manual") {
    context.addIssue({ code: "custom", path: ["sourceProvider"], message: "Escolha uma loja com adaptador de monitoramento." });
    return;
  }
  if (!fields.sourceUrl) {
    context.addIssue({ code: "custom", path: ["sourceUrl"], message: "Informe a URL original do produto, separada do link de afiliado." });
    return;
  }
  try {
    getMarketplaceProvider(fields.sourceProvider).parseItemId(fields.sourceUrl);
  } catch {
    context.addIssue({ code: "custom", path: ["sourceUrl"], message: "Informe uma URL canônica válida da loja escolhida." });
  }
}

function validateProductFields(fields: z.output<typeof productFieldsBase>, context: z.RefinementCtx) {
  validateProductPricing(fields, context);
  validateProductMonitor(fields, context);
}

const productFields = productFieldsBase.superRefine(validateProductFields);

function isProductImagePath(value: string) {
  return value.startsWith("/manus-storage/") &&
    !value.includes("..") &&
    /^\/manus-storage\/[A-Za-z0-9._/-]+$/.test(value);
}

function matchesImageSignature(contentType: string, bytes: Buffer) {
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

const categoriesInput = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(49).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
}).optional();

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user ? { ...ctx.user, isAdmin: isAdminAuthorized(ctx.user) } : null),
    providers: publicProcedure.query(() => ({
      google: Boolean(ENV.googleClientId && ENV.googleClientSecret),
    })),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  products: router({
    list: publicProcedure.input(categoriesInput).query(({ input }) => db.listProducts(input ?? {})),
    categories: publicProcedure.query(() => db.listProductCategories()),
    byId: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const product = await db.getProductById(input.id);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
        return product;
      }),
  }),
  admin: router({
    list: adminProcedure.query(() => db.listAdminProducts()),
    marketplaceProviders: adminProcedure.query(() => listMarketplaceProviders()),
    marketplaceStatus: adminProcedure.query(async () => {
      const [connection, schedule] = await Promise.all([
        db.getMarketplaceConnection("mercado_livre"),
        db.getScheduledJob("vitrineml-product-monitor"),
      ]);
      return {
        configured: mercadoLivreCredentialsConfigured(),
        connected: Boolean(connection),
        scheduleEnabled: Boolean(schedule?.enabled),
        isProduction: ENV.isProduction,
      };
    }),
    connectMercadoLivre: adminProcedure.mutation(({ ctx }) => startMercadoLivreOAuth(ctx.res)),
    disconnectMercadoLivre: adminProcedure.mutation(() => disconnectMercadoLivreConnection()),
    configureMonitorSchedule: adminProcedure.mutation(() => configureProductMonitorSchedule()),
    disableMonitorSchedule: adminProcedure.mutation(() => disableProductMonitorSchedule()),
    syncProductNow: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => syncProductNow(input.id)),
    uploadImage: adminProcedure
      .input(z.object({
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64: z.string().min(1).max(7_000_000),
      }))
      .mutation(async ({ input }) => {
        const bytes = Buffer.from(input.base64, "base64");
        if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024 || !matchesImageSignature(input.contentType, bytes)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Envie uma imagem JPG, PNG ou WebP válida de até 5 MB." });
        }
        const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType.slice("image/".length);
        try {
          return await storagePut(`affiliate-products/${randomUUID()}.${extension}`, bytes, input.contentType);
        } catch (error) {
          logInternalError("Product image upload", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível guardar a imagem. Tente novamente." });
        }
      }),
    create: adminProcedure.input(productFields).mutation(async ({ input }) => {
      const id = await db.createProduct(input);
      return { id };
    }),
    update: adminProcedure
      .input(productFieldsBase.extend({ id: z.number().int().positive() }).superRefine(validateProductFields))
      .mutation(async ({ input }) => {
        const { id, ...fields } = input;
        const existing = await db.getAdminProductById(id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
        }
        const sourceChanged = existing.sourceProvider !== fields.sourceProvider ||
          existing.sourceUrl !== fields.sourceUrl || existing.monitorEnabled !== fields.monitorEnabled;
        await db.updateProduct(id, {
          ...fields,
          ...(sourceChanged ? {
            availabilityStatus: "unknown" as const,
            lastCheckedAt: null,
            nextCheckAt: fields.monitorEnabled ? new Date() : null,
            lastSyncError: null,
            syncFailureCount: 0,
          } : {}),
        });
        return { success: true } as const;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        if (!(await db.getAdminProductById(input.id))) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
        }
        await db.deleteProduct(input.id);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
