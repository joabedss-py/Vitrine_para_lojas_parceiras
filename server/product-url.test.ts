import { describe, expect, it } from "vitest";
import { buildProductPath } from "../shared/product-url";

describe("product URLs", () => {
  it("builds a short canonical URL with only the product code and trailing slash", () => {
    expect(buildProductPath(30001)).toBe("/produto/30001/");
  });

  it("rejects invalid product codes", () => {
    expect(() => buildProductPath(0)).toThrow(RangeError);
    expect(() => buildProductPath(1.5)).toThrow(RangeError);
  });
});
