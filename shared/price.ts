const PRICE_PATTERN = /^\d{1,63}(?:[.,]\d{1,2})?$/;
export const MAX_PRICE_INPUT_LENGTH = 66;

export function isValidPriceString(value: string) {
  const normalized = value.trim();
  return PRICE_PATTERN.test(normalized) && /[1-9]/.test(normalized.replace(/[.,]/g, ""));
}

export function normalizePriceString(value: string) {
  const [integerPart, fractionPart = ""] = value.trim().replace(",", ".").split(".");
  return `${integerPart}.${fractionPart.padEnd(2, "0")}`;
}

function toMinorUnits(value: string) {
  if (!isValidPriceString(value)) throw new RangeError("Valor monetário inválido");
  const [integerPart, cents = "00"] = normalizePriceString(value).split(".");
  return BigInt(integerPart) * 100n + BigInt(cents);
}

export function comparePriceStrings(left: string, right: string): -1 | 0 | 1 {
  const leftMinor = toMinorUnits(left);
  const rightMinor = toMinorUnits(right);
  return leftMinor < rightMinor ? -1 : leftMinor > rightMinor ? 1 : 0;
}

/** Floors the discount to match common storefront badges such as 16% OFF. */
export function getDiscountPercentage(listPrice: string, salePrice: string) {
  const listMinor = toMinorUnits(listPrice);
  const saleMinor = toMinorUnits(salePrice);
  if (listMinor <= saleMinor) return 0;
  return Number(((listMinor - saleMinor) * 100n) / listMinor);
}

export function multiplyPriceStringByCount(value: string, count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 48) {
    throw new RangeError("Quantidade de parcelas inválida");
  }
  const totalMinor = toMinorUnits(value) * BigInt(count);
  return `${totalMinor / 100n}.${String(totalMinor % 100n).padStart(2, "0")}`;
}

const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatMoneyBRL(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value.trim().replace(",", "."));
  if (!match) return "R$\u00a00,00";

  const [, sign, integerPart, fractionPart = ""] = match;
  const integer = integerFormatter.format(BigInt(integerPart));
  const cents = fractionPart.padEnd(2, "0").slice(0, 2);
  return `${sign ? "-R$" : "R$"}\u00a0${integer},${cents}`;
}
