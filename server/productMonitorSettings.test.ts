import { describe, expect, it } from "vitest";
import { catalogProductFields, updateProductFields } from "./routers";
import { buildProductMonitorSettingsPatch } from "./productMonitorSettings";

const baseCatalogInput = {
  title: "Produto Shopee",
  description: "Descrição do produto.",
  category: "Casa",
  price: "299,90",
  listPrice: null,
  pixPrice: "279,90",
  cardInstallmentPrice: "29,99",
  installments: 10,
  cardInterestFree: false,
  storeName: "Shopee",
  shippingInfo: null,
  promotionInfo: null,
  imageUrl: "/manus-storage/produto.jpg",
  affiliateUrl: "https://s.shopee.com.br/afiliado?ref=parceiro",
  isActive: true,
};

const existingMonitorSettings = {
  sourceProvider: "mercado_livre",
  sourceUrl: "https://www.mercadolivre.com.br/p/MLB123456",
  monitorEnabled: true,
};

describe("admin monitor settings isolation", () => {
  it("creates products with monitoring disabled and ignores monitor settings sent by a caller", () => {
    const parsed = catalogProductFields.parse({
      ...baseCatalogInput,
      sourceProvider: "mercado_livre",
      sourceUrl: "https://www.mercadolivre.com.br/p/MLB123456",
      monitorEnabled: true,
    });

    expect(parsed.sourceProvider).toBe("manual");
    expect(parsed.sourceUrl).toBeNull();
    expect(parsed.monitorEnabled).toBe(false);
    expect(parsed.affiliateUrl).toBe(baseCatalogInput.affiliateUrl);
    expect(parsed.pixPrice).toBe("279.90");
    expect(parsed.cardInstallmentPrice).toBe("29.99");
    expect(parsed.installments).toBe(10);
  });

  it("does not expose monitor settings in the catalog update schema", () => {
    const parsed = updateProductFields.parse({
      ...baseCatalogInput,
      id: 42,
      ...existingMonitorSettings,
    });

    expect(parsed).not.toHaveProperty("sourceProvider");
    expect(parsed).not.toHaveProperty("sourceUrl");
    expect(parsed).not.toHaveProperty("monitorEnabled");
    expect(parsed).toMatchObject({
      id: 42,
      price: "299.90",
      pixPrice: "279.90",
      affiliateUrl: baseCatalogInput.affiliateUrl,
    });
  });

  it("updates only monitor and diagnostic fields, never commercial product data", () => {
    const now = new Date("2026-11-07T12:00:00.000Z");
    const patch = buildProductMonitorSettingsPatch(
      existingMonitorSettings,
      { sourceProvider: "manual", sourceUrl: null, monitorEnabled: false },
      false,
      now,
    );

    expect(patch).toEqual({
      sourceProvider: "manual",
      sourceUrl: null,
      monitorEnabled: false,
      availabilityStatus: "unknown",
      lastCheckedAt: null,
      nextCheckAt: null,
      lastSyncError: null,
      syncFailureCount: 0,
    });
    for (const commercialField of ["title", "price", "listPrice", "pixPrice", "cardInstallmentPrice", "installments", "cardInterestFree", "affiliateUrl", "shippingInfo", "promotionInfo"]) {
      expect(patch).not.toHaveProperty(commercialField);
    }
  });

  it("retakes an existing monitor immediately without discarding its last confirmed availability", () => {
    const now = new Date("2026-11-07T12:00:00.000Z");
    const patch = buildProductMonitorSettingsPatch(existingMonitorSettings, existingMonitorSettings, true, now);

    expect(patch).toMatchObject({
      monitorEnabled: true,
      nextCheckAt: now,
      lastSyncError: null,
      syncFailureCount: 0,
    });
    expect(patch).not.toHaveProperty("availabilityStatus");
    expect(patch).not.toHaveProperty("lastCheckedAt");
  });

  it("does not write when the monitor configuration is unchanged", () => {
    expect(buildProductMonitorSettingsPatch(existingMonitorSettings, existingMonitorSettings)).toBeNull();
  });
});
