import { formatMoneyBRL, multiplyPriceStringByCount } from "./price";

export type ProductAnnouncementDetails = {
  title: string;
  description: string;
  price: string | number;
  listPrice?: string | number | null;
  pixPrice?: string | number | null;
  cardInstallmentPrice?: string | number | null;
  installments?: number | null;
  cardInterestFree?: boolean | null;
  shippingInfo?: string | null;
  promotionInfo?: string | null;
};

function oneLine(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildProductAnnouncementText(product: ProductAnnouncementDetails, productUrl: string) {
  const lines = [
    `🛍️ ${oneLine(product.title)}`,
    `À vista: ${formatMoneyBRL(String(product.price))}`,
  ];

  if (product.pixPrice !== null && product.pixPrice !== undefined && String(product.pixPrice) !== "") {
    lines.push(`No Pix: ${formatMoneyBRL(String(product.pixPrice))}`);
  }
  if (product.cardInstallmentPrice && product.installments) {
    const installment = `${product.installments}x de ${formatMoneyBRL(String(product.cardInstallmentPrice))}`;
    const interest = product.cardInterestFree === null || product.cardInterestFree === undefined
      ? ""
      : product.cardInterestFree ? " sem juros" : " com juros";
    const total = multiplyPriceStringByCount(String(product.cardInstallmentPrice), product.installments);
    lines.push(`${installment}${interest} (total ${formatMoneyBRL(total)})`);
  }
  if (product.listPrice !== null && product.listPrice !== undefined && String(product.listPrice) !== "") {
    lines.push(`Preço original: ${formatMoneyBRL(String(product.listPrice))}`);
  }
  if (product.shippingInfo) lines.push(oneLine(product.shippingInfo));
  if (product.promotionInfo) lines.push(oneLine(product.promotionInfo));

  lines.push("", product.description.trim(), "", `Veja na Vitrine: ${productUrl}`);
  return lines.join("\n");
}
