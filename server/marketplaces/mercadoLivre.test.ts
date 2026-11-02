import { describe, expect, it, vi } from "vitest";
import { fetchMercadoLivreSnapshot, parseMercadoLivreItemId } from "./mercadoLivre";
import { MarketplaceProviderError } from "./types";

describe("parseMercadoLivreItemId", () => {
  it("extracts an MLB item id from a canonical Brazilian product URL", () => {
    expect(parseMercadoLivreItemId("https://produto.mercadolivre.com.br/MLB-1234567890-fone-bluetooth-_JM"))
      .toBe("MLB1234567890");
  });

  it("rejects affiliate short links and lookalike domains", () => {
    expect(() => parseMercadoLivreItemId("https://meli.la/abc123")).toThrow(MarketplaceProviderError);
    expect(() => parseMercadoLivreItemId("https://evilmercadolivre.com.br/MLB-1234567890-produto"))
      .toThrow(MarketplaceProviderError);
    expect(() => parseMercadoLivreItemId("http://produto.mercadolivre.com.br/MLB-1234567890-produto"))
      .toThrow(MarketplaceProviderError);
    expect(() => parseMercadoLivreItemId("https://produto.mercadolivre.com.br:8443/MLB-1234567890-produto"))
      .toThrow(MarketplaceProviderError);
  });
});

describe("fetchMercadoLivreSnapshot", () => {
  it("normalizes BRL pricing and maps a zero quantity to out-of-stock", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "MLB1234567890",
      site_id: "MLB",
      currency_id: "BRL",
      price: 129.9,
      original_price: 159.9,
      status: "active",
      available_quantity: 0,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const snapshot = await fetchMercadoLivreSnapshot("MLB1234567890", "test-token", fetcher);
    expect(snapshot).toEqual({
      provider: "mercado_livre",
      itemId: "MLB1234567890",
      price: "129.90",
      listPrice: "159.90",
      availability: "out_of_stock",
      currency: "BRL",
    });
  });

  it("does not report inactive listings as out of stock when quantity is unknown", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "MLB1234567890",
      site_id: "MLB",
      currency_id: "BRL",
      price: 129.9,
      original_price: null,
      status: "paused",
      available_quantity: 5,
    }), { status: 200 }));
    const snapshot = await fetchMercadoLivreSnapshot("MLB1234567890", "test-token", fetcher);
    expect(snapshot.availability).toBe("unavailable");
    expect(snapshot.listPrice).toBeNull();
  });

  it("leaves the original-price field undefined when the API omits it", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "MLB1234567890",
      site_id: "MLB",
      currency_id: "BRL",
      price: 129.9,
      status: "active",
      available_quantity: 1,
    }), { status: 200 }));
    const snapshot = await fetchMercadoLivreSnapshot("MLB1234567890", "test-token", fetcher);
    expect(snapshot.listPrice).toBeUndefined();
  });

  it("treats a paused listing with zero quantity as unavailable, not confirmed out of stock", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "MLB1234567890",
      site_id: "MLB",
      currency_id: "BRL",
      price: 129.9,
      status: "paused",
      available_quantity: 0,
    }), { status: 200 }));
    const snapshot = await fetchMercadoLivreSnapshot("MLB1234567890", "test-token", fetcher);
    expect(snapshot.availability).toBe("unavailable");
  });

  it("compares large source prices using decimal strings instead of floating-point rounding", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "MLB1234567890",
      site_id: "MLB",
      currency_id: "BRL",
      price: "9007199254740992.00",
      original_price: "9007199254740992.01",
      status: "active",
      available_quantity: 1,
    }), { status: 200 }));
    const snapshot = await fetchMercadoLivreSnapshot("MLB1234567890", "test-token", fetcher);
    expect(snapshot.price).toBe("9007199254740992.00");
    expect(snapshot.listPrice).toBe("9007199254740992.01");
  });

  it("does not confirm removal from an uninformative 404 response", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 404 }));
    await expect(fetchMercadoLivreSnapshot("MLB1234567890", "test-token", fetcher))
      .rejects.toMatchObject({ code: "unavailable" });
  });

  it("classifies 403 as a permission failure without requesting a token refresh", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(fetchMercadoLivreSnapshot("MLB1234567890", "test-token", fetcher))
      .rejects.toMatchObject({ code: "forbidden" });
  });
});
