import { describe, expect, it } from "vitest";
import { buildProductPath, slugifyProductTitle } from "../shared/product-url";

describe("product URLs", () => {
  it("builds a URL with product code and normalized readable title", () => {
    expect(buildProductPath(42, "Placa de Vídeo MSI RTX 5070 Ti 16GB"))
      .toBe("/produto/42/placa-de-video-msi-rtx-5070-ti-16gb");
  });

  it("normalizes accents and punctuation and provides a fallback", () => {
    expect(slugifyProductTitle("Câmera & Acessórios: edição especial!"))
      .toBe("camera-e-acessorios-edicao-especial");
    expect(slugifyProductTitle("🔥" )).toBe("produto");
  });

  it("rejects invalid product codes", () => {
    expect(() => buildProductPath(0, "Produto")).toThrow(RangeError);
    expect(() => buildProductPath(1.5, "Produto")).toThrow(RangeError);
  });
});
