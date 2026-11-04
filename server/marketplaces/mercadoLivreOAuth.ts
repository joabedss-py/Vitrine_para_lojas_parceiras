import { eq } from "drizzle-orm";
import { marketplaceConnections } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "../_core/env";
import { MarketplaceProviderError } from "./types";
import { decryptMarketplaceToken, encryptMarketplaceToken } from "./tokenVault";

export const MERCADOLIVRE_CALLBACK_URI = "https://vitrineml-ecps2ye7.manus.space/api/oauth/mercadolivre/callback";
const AUTHORIZATION_URL = "https://auth.mercadolivre.com.br/authorization";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const TOKEN_REFRESH_SKEW_MS = 60_000;

type MercadoLivreTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  user_id?: unknown;
};

export function mercadoLivreCredentialsConfigured() {
  return Boolean(ENV.mercadoLivreClientId.trim() && ENV.mercadoLivreClientSecret.trim());
}

export function buildMercadoLivreAuthorizationUrl(state: string) {
  if (!mercadoLivreCredentialsConfigured()) {
    throw new MarketplaceProviderError("unauthorized", "A conexão do Mercado Livre ainda não foi configurada.");
  }
  const authorizationUrl = new URL(AUTHORIZATION_URL);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", ENV.mercadoLivreClientId.trim());
  authorizationUrl.searchParams.set("redirect_uri", MERCADOLIVRE_CALLBACK_URI);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("scope", "read offline_access");
  return authorizationUrl.toString();
}

async function requestToken(body: URLSearchParams) {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new MarketplaceProviderError("unavailable", "Não foi possível concluir a conexão com o Mercado Livre.", undefined, { cause: error });
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 24 * 60 * 60 * 1000) : undefined;
    throw new MarketplaceProviderError("rate_limited", "A conexão com o Mercado Livre foi limitada temporariamente.", retryAfterMs);
  }
  if (!response.ok) {
    throw new MarketplaceProviderError("unauthorized", "A autorização do Mercado Livre precisa ser revisada.");
  }

  let token: MercadoLivreTokenResponse;
  try {
    token = await response.json() as MercadoLivreTokenResponse;
  } catch (error) {
    throw new MarketplaceProviderError("invalid_response", "O Mercado Livre retornou uma resposta de autorização inválida.", undefined, { cause: error });
  }

  const accessToken = typeof token.access_token === "string" ? token.access_token : "";
  const refreshToken = typeof token.refresh_token === "string" ? token.refresh_token : "";
  const scope = typeof token.scope === "string" ? token.scope.trim() : "";
  const expiresIn = Number(token.expires_in);
  const accountId = typeof token.user_id === "number" || typeof token.user_id === "string" ? String(token.user_id) : "";
  if (!accessToken || !refreshToken || !accountId || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new MarketplaceProviderError("invalid_response", "A autorização do Mercado Livre não retornou os campos necessários.");
  }
  const scopes = new Set(scope.split(/\s+/).filter(Boolean));
  if (!scopes.has("read") || !scopes.has("offline_access")) {
    throw new MarketplaceProviderError("unauthorized", "A conta precisa autorizar leitura e acesso offline para sincronizar produtos.");
  }
  return { accessToken, refreshToken, scope, expiresIn, accountId };
}

export async function exchangeMercadoLivreAuthorizationCode(code: string) {
  if (!mercadoLivreCredentialsConfigured()) {
    throw new MarketplaceProviderError("unauthorized", "A conexão do Mercado Livre ainda não foi configurada.");
  }
  const tokens = await requestToken(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: ENV.mercadoLivreClientId.trim(),
    client_secret: ENV.mercadoLivreClientSecret,
    code,
    redirect_uri: MERCADOLIVRE_CALLBACK_URI,
  }));
  const now = new Date();
  await db.saveMarketplaceConnection({
    provider: "mercado_livre",
    accountId: tokens.accountId,
    accessTokenCiphertext: encryptMarketplaceToken(tokens.accessToken, ENV.mercadoLivreClientSecret),
    refreshTokenCiphertext: encryptMarketplaceToken(tokens.refreshToken, ENV.mercadoLivreClientSecret),
    accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
    scope: tokens.scope,
  });
  await db.restartProviderMonitors("mercado_livre");
}

/**
 * Return the cached access token, refreshing under a row lock when it is close
 * to expiry. If `rejectedToken` is provided, refresh only when that token is
 * still the current one; concurrent 401 responses reuse the newly rotated token.
 */
export async function getMercadoLivreAccessToken(rejectedToken?: string) {
  if (!mercadoLivreCredentialsConfigured()) {
    throw new MarketplaceProviderError("unauthorized", "A conexão do Mercado Livre ainda não foi configurada.");
  }
  const database = await db.getDb();
  if (!database) throw new MarketplaceProviderError("unavailable", "O banco de dados não está disponível.");

  return database.transaction(async tx => {
    const [connection] = await tx.select().from(marketplaceConnections)
      .where(eq(marketplaceConnections.provider, "mercado_livre"))
      .for("update")
      .limit(1);
    if (!connection) throw new MarketplaceProviderError("unauthorized", "Conecte uma conta do Mercado Livre para monitorar os produtos.");

    let currentAccessToken: string;
    try {
      currentAccessToken = decryptMarketplaceToken(connection.accessTokenCiphertext, ENV.mercadoLivreClientSecret);
    } catch (error) {
      throw new MarketplaceProviderError("unauthorized", "Reconecte a conta do Mercado Livre para continuar.", undefined, { cause: error });
    }

    const now = Date.now();
    const tokenIsFresh = connection.accessTokenExpiresAt.getTime() > now + TOKEN_REFRESH_SKEW_MS;
    if (tokenIsFresh && (!rejectedToken || currentAccessToken !== rejectedToken)) return currentAccessToken;

    let refreshToken: string;
    try {
      refreshToken = decryptMarketplaceToken(connection.refreshTokenCiphertext, ENV.mercadoLivreClientSecret);
    } catch (error) {
      throw new MarketplaceProviderError("unauthorized", "Reconecte a conta do Mercado Livre para continuar.", undefined, { cause: error });
    }

    const tokens = await requestToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ENV.mercadoLivreClientId.trim(),
      client_secret: ENV.mercadoLivreClientSecret,
      refresh_token: refreshToken,
    }));
    const checkedAt = new Date();
    await tx.update(marketplaceConnections).set({
      accountId: tokens.accountId,
      accessTokenCiphertext: encryptMarketplaceToken(tokens.accessToken, ENV.mercadoLivreClientSecret),
      refreshTokenCiphertext: encryptMarketplaceToken(tokens.refreshToken, ENV.mercadoLivreClientSecret),
      accessTokenExpiresAt: new Date(checkedAt.getTime() + tokens.expiresIn * 1000),
      scope: tokens.scope,
      updatedAt: checkedAt,
    }).where(eq(marketplaceConnections.provider, "mercado_livre"));
    return tokens.accessToken;
  });
}
