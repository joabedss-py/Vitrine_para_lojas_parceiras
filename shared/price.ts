const MAX_INTEGER_DIGITS = 63;
export const MAX_PRICE_INPUT_LENGTH = 86;

type ParsedPrice = { integer: string; cents: string };

function normalizeIntegerPart(value: string, groupSeparator?: string): string | null {
  if (/^\d+$/.test(value)) return value;
  if (!groupSeparator) return null;

  const groups = value.split(groupSeparator);
  if (groups.length < 2 || !/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(group => !/^\d{3}$/.test(group))) {
    return null;
  }
  return groups.join("");
}

function parsePrice(value: string): ParsedPrice | null {
  const input = value.trim();
  if (!input || !/^[\d.,]+$/.test(input)) return null;

  const hasDot = input.includes(".");
  const hasComma = input.includes(",");
  let integerPart: string | null = null;
  let fractionPart = "";

  if (hasDot && hasComma) {
    const decimalSeparator = input.lastIndexOf(".") > input.lastIndexOf(",") ? "." : ",";
    const decimalIndex = input.lastIndexOf(decimalSeparator);
    if (input.indexOf(decimalSeparator) !== decimalIndex) return null;

    fractionPart = input.slice(decimalIndex + 1);
    if (!/^\d{1,2}$/.test(fractionPart)) return null;

    const groupingSeparator = decimalSeparator === "." ? "," : ".";
    integerPart = normalizeIntegerPart(input.slice(0, decimalIndex), groupingSeparator);
  } else if (hasDot || hasComma) {
    const separator = hasDot ? "." : ",";
    const parts = input.split(separator);

    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && parts[1].length <= 2) {
      integerPart = parts[0];
      fractionPart = parts[1];
    } else {
      integerPart = normalizeIntegerPart(input, separator);
    }
  } else {
    integerPart = input;
  }

  if (!integerPart || !/^\d+$/.test(integerPart)) return null;
  integerPart = integerPart.replace(/^0+(?=\d)/, "");
  if (integerPart.length > MAX_INTEGER_DIGITS) return null;

  const cents = fractionPart.padEnd(2, "0");
  if (BigInt(integerPart) === 0n && BigInt(cents || "00") === 0n) return null;
  return { integer: integerPart, cents };
}

export function isValidPriceString(value: string) {
  return parsePrice(value) !== null;
}

export function normalizePriceString(value: string) {
  const parsed = parsePrice(value);
  if (!parsed) throw new RangeError("Valor monetário inválido");
  return `${parsed.integer}.${parsed.cents}`;
}

function toMinorUnits(value: string) {
  const parsed = parsePrice(value);
  if (!parsed) throw new RangeError("Valor monetário inválido");
  return BigInt(parsed.integer) * 100n + BigInt(parsed.cents);
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
