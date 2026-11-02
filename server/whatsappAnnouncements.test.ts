import { describe, expect, it } from "vitest";
import { buildProductAnnouncementText } from "../shared/whatsapp-announcement";

const product = {
  title: "Fone sem fio",
  description: "Cancelamento de ruído\nBateria de longa duração.",
  price: "299.90",
  listPrice: "399.90",
  pixPrice: "279.90",
  cardInstallmentPrice: "29.99",
  installments: 10,
  cardInterestFree: true,
  shippingInfo: "Frete grátis",
  promotionInfo: "Oferta por tempo limitado",
  affiliateUrl: "https://loja.example/afiliado?tag=privado",
};

const productUrl = "https://vitrineml-ecps2ye7.manus.space/produto/30001/";

describe("manual channel announcement text", () => {
  it("includes the product name, complete description, prices, conditions and public Vitrine link", () => {
    const text = buildProductAnnouncementText(product, productUrl);
    expect(text).toContain("Fone sem fio");
    expect(text).toContain("Cancelamento de ruído\nBateria de longa duração.");
    expect(text).toContain("À vista: R$\u00a0299,90");
    expect(text).toContain("No Pix: R$\u00a0279,90");
    expect(text).toContain("10x de R$\u00a029,99 sem juros (total R$\u00a0299,90)");
    expect(text).toContain("Preço original: R$\u00a0399,90");
    expect(text).toContain("Frete grátis");
    expect(text).toContain("Oferta por tempo limitado");
    expect(text).toContain(productUrl);
    expect(text).not.toContain(product.affiliateUrl);
  });

  it("omits payment conditions that were not registered", () => {
    const text = buildProductAnnouncementText({
      title: "Produto básico",
      description: "Descrição simples.",
      price: "49.90",
    }, productUrl);
    expect(text).toContain("À vista: R$\u00a049,90");
    expect(text).toContain("Descrição simples.");
    expect(text).not.toContain("No Pix:");
    expect(text).not.toContain("Preço original:");
    expect(text).not.toContain("x de");
  });
});
