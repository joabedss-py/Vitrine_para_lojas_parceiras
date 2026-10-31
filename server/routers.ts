import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { storagePut } from "./storage";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

const productFields = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(6000),
  category: z.string().trim().min(1).max(80),
  price: z.number().finite().positive().max(99_999_999.99),
  imageUrl: z.string().min(1).max(1000).refine(isProductImagePath, "Imagem inválida"),
  affiliateUrl: z.string().url().max(2048),
  isActive: z.boolean(),
});

function isProductImagePath(value: string) {
  return value.startsWith("/manus-storage/") &&
    !value.includes("..") &&
    /^\/manus-storage\/[A-Za-z0-9._/-]+$/.test(value);
}

function isMercadoLivreUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    const officialDomains = [
      "mercadolivre.com.br",
      "mercadolivre.com",
      "mercadolibre.com.br",
      "mercadolibre.com",
      "meli.la",
    ];
    return officialDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function validateAffiliateUrl(value: string) {
  if (!isMercadoLivreUrl(value)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use um link HTTPS do Mercado Livre ou um link curto meli.la.",
    });
  }
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
}).optional();

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível guardar a imagem. Tente novamente." });
        }
      }),
    create: adminProcedure.input(productFields).mutation(async ({ input }) => {
      validateAffiliateUrl(input.affiliateUrl);
      const id = await db.createProduct({
        ...input,
        price: input.price.toFixed(2),
      });
      return { id };
    }),
    update: adminProcedure
      .input(productFields.extend({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        validateAffiliateUrl(input.affiliateUrl);
        const { id, ...fields } = input;
        if (!(await db.getAdminProductById(id))) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
        }
        await db.updateProduct(id, { ...fields, price: input.price.toFixed(2) });
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
