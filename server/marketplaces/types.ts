export type MarketplaceAvailability = "available" | "out_of_stock" | "unavailable";

export type MarketplaceSnapshot = {
  provider: string;
  itemId: string;
  price: string;
  listPrice?: string | null;
  availability: MarketplaceAvailability;
  currency: string;
};

export type MarketplaceErrorCode =
  | "invalid_source"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

export class MarketplaceProviderError extends Error {
  constructor(
    readonly code: MarketplaceErrorCode,
    message: string,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MarketplaceProviderError";
  }
}

export interface MarketplaceProvider {
  readonly id: string;
  readonly label: string;
  parseItemId(sourceUrl: string): string;
  getAccessToken(rejectedToken?: string): Promise<string>;
  fetchSnapshot(itemId: string, accessToken: string): Promise<MarketplaceSnapshot>;
}
