import { randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { logInternalError } from "./errorLogging";
import { ENV } from "./env";
import { exchangeMercadoLivreAuthorizationCode, buildMercadoLivreAuthorizationUrl } from "../marketplaces/mercadoLivreOAuth";
import { MarketplaceProviderError } from "../marketplaces/types";

export const MERCADOLIVRE_STATE_COOKIE = "__Host-mercadolivre_oauth_state";
const OAUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 10 * 60 * 1000,
};
const STATE_LENGTH_BYTES = 32;

function newState() {
  return randomBytes(STATE_LENGTH_BYTES).toString("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function redirectToAdmin(res: Response, status: "connected" | "error" | "cancelled" | "unavailable") {
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, `/admin/monitoramento?mercadolivre=${status}`);
}

function clearStateCookie(res: Response) {
  const { maxAge: _maxAge, ...clearOptions } = OAUTH_COOKIE_OPTIONS;
  res.clearCookie(MERCADOLIVRE_STATE_COOKIE, clearOptions);
}

export function startMercadoLivreOAuth(res: Response) {
  if (!ENV.isProduction) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A conexão da loja fica disponível depois da publicação do site." });
  }
  try {
    const state = newState();
    const authorizationUrl = buildMercadoLivreAuthorizationUrl(state);
    res.setHeader("Cache-Control", "no-store");
    res.cookie(MERCADOLIVRE_STATE_COOKIE, state, OAUTH_COOKIE_OPTIONS);
    return { authorizationUrl };
  } catch (error) {
    if (error instanceof MarketplaceProviderError) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A integração Mercado Livre ainda não está configurada." });
    }
    throw error;
  }
}

export function registerMercadoLivreOAuthRoutes(app: Express) {
  app.get("/api/oauth/mercadolivre/callback", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expectedState = cookies[MERCADOLIVRE_STATE_COOKIE];
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const providerError = typeof req.query.error === "string" ? req.query.error : "";
    clearStateCookie(res);

    if (!expectedState || !state || !safeEqual(state, expectedState)) {
      redirectToAdmin(res, "error");
      return;
    }
    if (providerError === "access_denied") {
      redirectToAdmin(res, "cancelled");
      return;
    }
    if (providerError || !code) {
      redirectToAdmin(res, "error");
      return;
    }

    try {
      await exchangeMercadoLivreAuthorizationCode(code);
      redirectToAdmin(res, "connected");
    } catch (error) {
      logInternalError("Mercado Livre OAuth callback", error);
      redirectToAdmin(res, "error");
    }
  });
}
