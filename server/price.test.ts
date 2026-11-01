import { describe, expect, it } from "vitest";
import { formatMoneyBRL, isValidPriceString, normalizePriceString } from "../shared/price";

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
});
