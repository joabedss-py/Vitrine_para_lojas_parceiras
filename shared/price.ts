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

const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatMoneyBRL(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value.trim().replace(",", "."));
  if (!match) return "R$\u00a00,00";

  const [, sign, integerPart, fractionPart = ""] = match;
  const integer = integerFormatter.format(BigInt(integerPart));
  const cents = fractionPart.padEnd(2, "0").slice(0, 2);
  return `${sign ? "-R$" : "R$"}\u00a0${integer},${cents}`;
}
