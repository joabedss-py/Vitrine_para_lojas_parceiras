import { comparePriceStrings, isValidPriceString, normalizePriceString } from "../../shared/price";
import { getMercadoLivreAccessToken } from "./mercadoLivreOAuth";
import { MarketplaceProviderError, type MarketplaceProvider, type MarketplaceSnapshot } from "./types";

const API_ORIGIN = "https://api.mercadolibre.com";
const ITEM_ID_PATTERN = /^MLB\d{6,}$/;

function toPrice(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const candidate = String(value);
  if (!isValidPriceString(candidate)) return null;
  return normalizePriceString(candidate);
}

export function parseMercadoLivreItemId(sourceUrl: string): string {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new MarketplaceProviderError("invalid_source", "Informe a URL original do produto Mercado Livre.");
  }

  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || (host !== "mercadolivre.com.br" && !host.endsWith(".mercadolivre.com.br"))) {
    throw new MarketplaceProviderError("invalid_source", "Use uma URL HTTPS canônica do Mercado Livre Brasil.");
  }

  const match = url.pathname.match(/(?:^|\/)(MLB)-?(\d{6,})(?=[-_/\.]|$)/i);
  if (!match) {
    throw new MarketplaceProviderError("invalid_source", "A URL não contém um identificador de anúncio MLB válido.");
  }
  const itemId = `MLB${match[2]}`;
  if (!ITEM_ID_PATTERN.test(itemId)) {
    throw new MarketplaceProviderError("invalid_source", "O identificador do anúncio não é válido.");
  }
  return itemId;
}

function availabilityFromItem(status: unknown, availableQuantity: unknown) {
  if (status === "active") {
    if (typeof availableQuantity === "number" && availableQuantity === 0) return "out_of_stock" as const;
    return "available" as const;
  }
  if (typeof status === "string" && status.length > 0) return "unavailable" as const;
  throw new MarketplaceProviderError("invalid_response", "A loja retornou um estado de disponibilidade inválido.");
}

export async function fetchMercadoLivreSnapshot(
  itemId: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<MarketplaceSnapshot> {
  if (!ITEM_ID_PATTERN.test(itemId)) {
    throw new MarketplaceProviderError("invalid_source", "O identificador do anúncio não é válido.");
  }
  if (!accessToken) throw new MarketplaceProviderError("unauthorized", "A conexão com a loja precisa ser renovada.");

  let response: Response;
  try {
    response = await fetcher(`${API_ORIGIN}/items/${encodeURIComponent(itemId)}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new MarketplaceProviderError("unavailable", "Não foi possível consultar a loja.", undefined, { cause: error });
  }

  if (response.status === 404 || response.status === 410) {
    throw new MarketplaceProviderError("not_found", "O anúncio não está disponível na loja.");
  }
  if (response.status === 401) {
    throw new MarketplaceProviderError("unauthorized", "A autorização da loja precisa ser renovada.");
  }
  if (response.status === 403) {
    throw new MarketplaceProviderError("forbidden", "A loja não autorizou a consulta deste anúncio.");
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 24 * 60 * 60 * 1000) : undefined;
    throw new MarketplaceProviderError("rate_limited", "A loja limitou temporariamente as consultas.", retryAfterMs);
  }
  if (!response.ok) {
    throw new MarketplaceProviderError("unavailable", "A loja não respondeu à consulta.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new MarketplaceProviderError("invalid_response", "A loja retornou uma resposta inválida.", undefined, { cause: error });
  }

  if (!payload || typeof payload !== "object") {
    throw new MarketplaceProviderError("invalid_response", "A loja retornou uma resposta inválida.");
  }
  const item = payload as Record<string, unknown>;
  if (item.id !== itemId || item.site_id !== "MLB" || item.currency_id !== "BRL") {
    throw new MarketplaceProviderError("invalid_response", "O anúncio não pertence ao Mercado Livre Brasil ou usa moeda não suportada.");
  }

  const price = toPrice(item.price);
  if (!price) throw new MarketplaceProviderError("invalid_response", "A loja não forneceu um preço válido.");

  const hasOriginalPrice = Object.prototype.hasOwnProperty.call(item, "original_price");
  const sourceListPrice = hasOriginalPrice ? toPrice(item.original_price) : null;
  const listPrice = !hasOriginalPrice
    ? undefined
    : item.original_price === null
      ? null
      : sourceListPrice
        ? comparePriceStrings(sourceListPrice, price) > 0 ? sourceListPrice : null
        : undefined;
  const availability = availabilityFromItem(item.status, item.available_quantity);

  return { provider: "mercado_livre", itemId, price, listPrice, availability, currency: "BRL" };
}

export const mercadoLivreProvider: MarketplaceProvider = {
  id: "mercado_livre",
  label: "Mercado Livre",
  parseItemId: parseMercadoLivreItemId,
  getAccessToken: getMercadoLivreAccessToken,
  fetchSnapshot: fetchMercadoLivreSnapshot,
};
