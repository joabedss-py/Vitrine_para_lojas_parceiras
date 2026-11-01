import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

export function isAdminAuthorized(user: NonNullable<TrpcContext["user"]>) {
  const normalizedEmail = user.email?.trim().toLowerCase();
  const configuredEmail = ENV.adminEmail.trim().toLowerCase();
  const isAllowlisted =
    (Boolean(configuredEmail) && normalizedEmail === configuredEmail) ||
    (Boolean(ENV.ownerOpenId) && user.openId === ENV.ownerOpenId);
  return user.role === "admin" && isAllowlisted;
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || !isAdminAuthorized(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
