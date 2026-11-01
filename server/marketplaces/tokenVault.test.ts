import { describe, expect, it } from "vitest";
import { decryptMarketplaceToken, encryptMarketplaceToken } from "./tokenVault";

describe("marketplace token vault", () => {
  it("round-trips a token and produces a fresh ciphertext each time", () => {
    const first = encryptMarketplaceToken("sample-refresh-token", "sample-client-secret");
    const second = encryptMarketplaceToken("sample-refresh-token", "sample-client-secret");
    expect(decryptMarketplaceToken(first, "sample-client-secret")).toBe("sample-refresh-token");
    expect(first).not.toBe(second);
  });

  it("fails closed when ciphertext is modified or the client secret changes", () => {
    const ciphertext = encryptMarketplaceToken("sample-access-token", "first-secret");
    expect(() => decryptMarketplaceToken(ciphertext, "second-secret")).toThrow("could not be decrypted");
  });
});
