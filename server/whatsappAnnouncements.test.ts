import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Product } from "../drizzle/schema";
import { buildGroupImageMessage, buildProductAnnouncementCaption, normalizeProductImageToJpeg } from "./whatsappAnnouncements";

const product = {
  id: 30001,
  title: "Fone sem fio",
  description: "Descrição não deve ser enviada no anúncio.",
  category: "Tecnologia",
  price: "299.90",
  listPrice: "399.90",
  pixPrice: "279.90",
  cardInstallmentPrice: "29.99",
  installments: 10,
  cardInterestFree: true,
  storeName: "Loja parceira",
  shippingInfo: "Frete grátis",
  promotionInfo: "Oferta por tempo limitado",
  imageUrl: "/manus-storage/products/fone.webp",
  affiliateUrl: "https://loja-parceira.example/afiliado?tag=secreto",
  isActive: true,
} as unknown as Product;

describe("WhatsApp product announcements", () => {
  it("includes product conditions and the short Vitrine URL without exposing the affiliate destination", () => {
    const caption = buildProductAnnouncementCaption(product, "https://vitrineml-ecps2ye7.manus.space/produto/30001/");
    expect(caption).toContain("Fone sem fio");
    expect(caption).toContain("À vista: R$ 299,90");
    expect(caption).toContain("No Pix: R$ 279,90");
    expect(caption).toContain("10x de R$ 29,99 sem juros");
    expect(caption).toContain("/produto/30001/");
    expect(caption).not.toContain(product.affiliateUrl);
    expect(caption).not.toContain("Descrição não deve ser enviada");
  });

  it("targets the group and sends the uploaded media ID with the caption", () => {
    expect(buildGroupImageMessage("group_123", "media_456", "Legenda")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "group",
      to: "group_123",
      type: "image",
      image: { id: "media_456", caption: "Legenda" },
    });
  });

  it("normalizes a supported input to a JPEG before the Meta media upload", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 120, g: 160, b: 200 } },
    }).png().toBuffer();
    const jpeg = await normalizeProductImageToJpeg(png);
    expect((await sharp(jpeg).metadata()).format).toBe("jpeg");
  });
});
