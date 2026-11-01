import { describe, expect, it } from "vitest";
import { comparePriceStrings, formatMoneyBRL, getDiscountPercentage, isValidPriceString, multiplyPriceStringByCount, normalizePriceString } from "../shared/price";

describe("price helpers", () => {
  it("accepts values beyond the former R$ 99.999.999,99 ceiling", () => {
    expect(isValidPriceString("100000000,5")).toBe(true);
    expect(normalizePriceString("100000000,5")).toBe("100000000.50");
  });

  it("supports the maximum decimal precision without Number conversion", () => {
    const maximumWholeDigits = "9".repeat(63);
    expect(isValidPriceString(`${maximumWholeDigits},99`)).toBe(true);
    expect(isValidPriceString(`${maximumWholeDigits}9,99`)).toBe(false);
    expect(normalizePriceString(`${maximumWholeDigits},99`)).toBe(`${maximumWholeDigits}.99`);
  });

  it("rejects zero and more than two fractional digits", () => {
    expect(isValidPriceString("0,00")).toBe(false);
    expect(isValidPriceString("10,999")).toBe(false);
  });

  it("formats large BRL values and preserves cents exactly", () => {
    expect(formatMoneyBRL("100000000.5")).toBe("R$\u00a0100.000.000,50");
  });

  it("matches a storefront discount badge and calculates the total card price", () => {
    expect(getDiscountPercentage("11639,00", "9699,00")).toBe(16);
    expect(multiplyPriceStringByCount("969,90", 10)).toBe("9699.00");
  });

  it("compares large prices without floating-point conversion", () => {
    const large = `${"9".repeat(63)},99`;
    expect(comparePriceStrings(large, `${"9".repeat(63)},98`)).toBe(1);
  });

  it("recognizes a real sub-1-percent discount without inventing a whole-percent badge", () => {
    expect(comparePriceStrings("100.99", "100.00")).toBe(1);
    expect(getDiscountPercentage("100.99", "100.00")).toBe(0);
  });
});
