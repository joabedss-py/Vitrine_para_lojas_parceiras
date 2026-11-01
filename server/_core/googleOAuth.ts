import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { logInternalError } from "./errorLogging";

const GOOGLE_CALLBACK_URI = "https://vitrineml-ecps2ye7.manus.space/api/oauth/google/callback";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const TRANSIENT_COOKIE_MAX_AGE = 10 * 60 * 1000;
const TRANSIENT_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: TRANSIENT_COOKIE_MAX_AGE,
};
const STATE_COOKIE = "__Host-google_oauth_state";
const NONCE_COOKIE = "__Host-google_oauth_nonce";
const VERIFIER_COOKIE = "__Host-google_oauth_verifier";
const TRANSIENT_COOKIE_NAMES = [STATE_COOKIE, NONCE_COOKIE, VERIFIER_COOKIE];

type GoogleTokenResponse = { id_token?: unknown };

function queryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function credentialsAvailable() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret);
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function clearTransientCookies(res: Response) {
  const options: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  };
  TRANSIENT_COOKIE_NAMES.forEach(name => res.clearCookie(name, options));
}

function redirectToAdmin(res: Response, status: "error" | "cancelled" | "unavailable" | "unauthorized") {
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, `/admin?google=${status}`);
}

export function registerGoogleOAuthRoutes(app: Express) {
  app.get("/api/oauth/google/start", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (!credentialsAvailable()) {
      redirectToAdmin(res, "unavailable");
      return;
    }

    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    res.cookie(STATE_COOKIE, state, TRANSIENT_COOKIE_OPTIONS);
    res.cookie(NONCE_COOKIE, nonce, TRANSIENT_COOKIE_OPTIONS);
    res.cookie(VERIFIER_COOKIE, verifier, TRANSIENT_COOKIE_OPTIONS);

    const authorizationUrl = new URL(GOOGLE_AUTHORIZE_URL);
    authorizationUrl.searchParams.set("client_id", ENV.googleClientId);
    authorizationUrl.searchParams.set("redirect_uri", GOOGLE_CALLBACK_URI);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("prompt", "select_account");
    res.redirect(302, authorizationUrl.toString());
  });

  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (!credentialsAvailable()) {
      clearTransientCookies(res);
      redirectToAdmin(res, "unavailable");
      return;
    }

    const queryError = queryParam(req, "error");
    const code = queryParam(req, "code");
    const state = queryParam(req, "state");
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expectedState = cookies[STATE_COOKIE];
    const expectedNonce = cookies[NONCE_COOKIE];
    const verifier = cookies[VERIFIER_COOKIE];

    if (!state || !expectedState || !expectedNonce || !verifier || !safeEqual(state, expectedState)) {
      clearTransientCookies(res);
      redirectToAdmin(res, "error");
      return;
    }
    clearTransientCookies(res);

    if (queryError === "access_denied") {
      redirectToAdmin(res, "cancelled");
      return;
    }
    if (queryError || !code) {
      redirectToAdmin(res, "error");
      return;
    }

    try {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: GOOGLE_CALLBACK_URI,
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenResponse.ok) throw new Error("Google token exchange failed");
      const tokens = await tokenResponse.json() as GoogleTokenResponse;
      if (typeof tokens.id_token !== "string") throw new Error("Google ID token missing");

      const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
        algorithms: ["RS256"],
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: ENV.googleClientId,
        requiredClaims: ["exp", "sub", "nonce", "email", "email_verified"],
      });
      const audienceValues = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (audienceValues.length > 1 && payload.azp !== ENV.googleClientId) {
        throw new Error("Google authorized party validation failed");
      }
      const subject = typeof payload.sub === "string" ? payload.sub : "";
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const name = typeof payload.name === "string" ? payload.name : email;
      if (
        !subject ||
        !email ||
        payload.email_verified !== true ||
        typeof payload.nonce !== "string" ||
        !safeEqual(payload.nonce, expectedNonce)
      ) {
        throw new Error("Google identity validation failed");
      }

      const allowedEmail = ENV.adminEmail.trim().toLowerCase();
      if (!allowedEmail || email !== allowedEmail) {
        redirectToAdmin(res, "unauthorized");
        return;
      }

      const openId = `g_${createHash("sha256").update(subject).digest("base64url")}`;
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/admin");
    } catch (error) {
      logInternalError("GoogleOAuth callback", error);
      redirectToAdmin(res, "error");
    }
  });
}
