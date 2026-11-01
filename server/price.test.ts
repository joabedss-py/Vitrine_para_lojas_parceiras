import { describe, expect, it } from "vitest";
import { comparePriceStrings, formatMoneyBRL, getDiscountPercentage, isValidPriceString, MAX_PRICE_INPUT_LENGTH, multiplyPriceStringByCount, normalizePriceString } from "../shared/price";

describe("price helpers", () => {
  it("accepts values beyond the former R$ 99.999.999,99 ceiling", () => {
    expect(isValidPriceString("100000000,5")).toBe(true);
    expect(normalizePriceString("100000000,5")).toBe("100000000.50");
  });

  it("supports Brazilian and international decimal and thousands separators", () => {
    const cases = [
      ["9.699,00", "9699.00"],
      ["9,699.00", "9699.00"],
      ["9699,00", "9699.00"],
      ["9699.00", "9699.00"],
      ["9.699", "9699.00"],
      ["1.234.567,89", "1234567.89"],
      ["1,234,567.89", "1234567.89"],
    ] as const;

    for (const [input, expected] of cases) {
      expect(isValidPriceString(input), input).toBe(true);
      expect(normalizePriceString(input), input).toBe(expected);
    }
  });

  it("supports the maximum decimal precision with grouping without Number conversion", () => {
    const maximumWholeDigits = "9".repeat(63);
    const groupedMaximum = maximumWholeDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    expect(MAX_PRICE_INPUT_LENGTH).toBeGreaterThanOrEqual(groupedMaximum.length + 3);
    expect(isValidPriceString(`${groupedMaximum},99`)).toBe(true);
    expect(isValidPriceString(`${maximumWholeDigits}9,99`)).toBe(false);
    expect(normalizePriceString(`${groupedMaximum},99`)).toBe(`${maximumWholeDigits}.99`);
  });

  it("rejects zero, malformed grouping, currency symbols and more than two cents", () => {
    expect(isValidPriceString("0,00")).toBe(false);
    expect(isValidPriceString("12.34,56")).toBe(false);
    expect(isValidPriceString("R$ 9.699,00")).toBe(false);
    expect(isValidPriceString("10,9999")).toBe(false);
  });

  it("formats large BRL values and preserves cents exactly", () => {
    expect(formatMoneyBRL("100000000.5")).toBe("R$\u00a0100.000.000,50");
  });

  it("matches a storefront discount badge and calculates the total card price", () => {
    expect(getDiscountPercentage("11.639,00", "9.699,00")).toBe(16);
    expect(multiplyPriceStringByCount("969,90", 10)).toBe("9699.00");
  });

  it("calculates installment totals exactly without floating-point rounding", () => {
    expect(multiplyPriceStringByCount("0,01", 3)).toBe("0.03");
    expect(multiplyPriceStringByCount("329,99", 12)).toBe("3959.88");
    expect(multiplyPriceStringByCount("1.234,56", 7)).toBe("8641.92");
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
