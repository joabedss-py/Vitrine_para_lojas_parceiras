import { describe, expect, it } from "vitest";
import { inferAffiliateStoreName, isSecureAffiliateUrl } from "./affiliate-url";

describe("affiliate URL handling", () => {
  it("accepts Shopee HTTPS affiliate links without changing their destination", () => {
    const url = "https://s.shopee.com.br/abc123?affiliate=partner";

    expect(isSecureAffiliateUrl(url)).toBe(true);
    expect(inferAffiliateStoreName(url)).toBe("Shopee");
    expect(new URL(url).toString()).toBe(url);
  });

  it("accepts HTTPS affiliate URLs from stores without a built-in label", () => {
    const url = "https://afiliados.loja-exemplo.com/oferta?ref=partner-42";

    expect(isSecureAffiliateUrl(url)).toBe(true);
    expect(inferAffiliateStoreName(url)).toBeNull();
  });

  it("recognizes known stores only on their actual domain or subdomain", () => {
    expect(inferAffiliateStoreName("https://produto.mercadolivre.com.br/item/MLB1234567890")).toBe("Mercado Livre");
    expect(inferAffiliateStoreName("https://shopee.com.br.evil.example/item")).toBeNull();
  });

  it("rejects insecure schemes and credential-bearing URLs", () => {
    expect(isSecureAffiliateUrl("http://shopee.com.br/item")).toBe(false);
    expect(isSecureAffiliateUrl("https://user:password@shopee.com.br/item")).toBe(false);
    expect(inferAffiliateStoreName("not a URL")).toBeNull();
  });
});
