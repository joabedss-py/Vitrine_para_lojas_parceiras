import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMercadoLivreAuthorizationUrl, MERCADOLIVRE_CALLBACK_URI } from "./mercadoLivreOAuth";

afterEach(() => vi.unstubAllEnvs());

describe("Mercado Livre OAuth URL", () => {
  it("uses the official callback and requests read-only offline access", () => {
    vi.stubEnv("MERCADOLIVRE_CLIENT_ID", "client-id-for-test");
    vi.stubEnv("MERCADOLIVRE_CLIENT_SECRET", "client-secret-for-test");

    const authorizationUrl = new URL(buildMercadoLivreAuthorizationUrl("opaque-state-for-test"));

    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe("https://auth.mercadolivre.com.br/authorization");
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("client-id-for-test");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(MERCADOLIVRE_CALLBACK_URI);
    expect(authorizationUrl.searchParams.get("scope")).toBe("read offline_access");
    expect(authorizationUrl.searchParams.get("state")).toBe("opaque-state-for-test");
    expect(authorizationUrl.searchParams.has("client_secret")).toBe(false);
  });

  it("does not build a connect URL when protected credentials are absent", () => {
    vi.stubEnv("MERCADOLIVRE_CLIENT_ID", "");
    vi.stubEnv("MERCADOLIVRE_CLIENT_SECRET", "");
    expect(() => buildMercadoLivreAuthorizationUrl("state")).toThrow("A conexão do Mercado Livre ainda não foi configurada.");
  });
});
