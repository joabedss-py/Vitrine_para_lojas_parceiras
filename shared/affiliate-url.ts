const knownAffiliateStores = [
  { domains: ["shopee.com.br", "shopee.com"], label: "Shopee" },
  { domains: ["mercadolivre.com.br", "mercadolibre.com"], label: "Mercado Livre" },
  { domains: ["amazon.com.br", "amazon.com", "amzn.to"], label: "Amazon" },
  { domains: ["magazineluiza.com.br", "magalu.com.br", "magazinevoce.com.br"], label: "Magalu" },
  { domains: ["aliexpress.com"], label: "AliExpress" },
] as const;

export function isSecureAffiliateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function inferAffiliateStoreName(value: string): string | null {
  if (!isSecureAffiliateUrl(value)) return null;

  const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  const match = knownAffiliateStores.find(store =>
    store.domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`)),
  );

  return match?.label ?? null;
}
