import type { CatalogProduct } from "@/lib/trpc";
import { comparePriceStrings, formatMoneyBRL, getDiscountPercentage, multiplyPriceStringByCount } from "@shared/price";

type PricingProduct = Pick<
  CatalogProduct,
  | "price"
  | "listPrice"
  | "pixPrice"
  | "cardInstallmentPrice"
  | "installments"
  | "cardInterestFree"
  | "storeName"
  | "shippingInfo"
  | "promotionInfo"
>;

export default function ProductPricing({ product, compact = false }: { product: PricingProduct; compact?: boolean }) {
  const hasListPrice = Boolean(product.listPrice && comparePriceStrings(product.listPrice, product.price) > 0);
  const discount = hasListPrice && product.listPrice ? getDiscountPercentage(product.listPrice, product.price) : 0;
  const hasCardTerms = Boolean(product.cardInstallmentPrice) && product.installments !== null;

  return (
    <div className={`product-pricing${compact ? " is-compact" : ""}`}>
      {product.storeName && <p className="pricing-store">Loja parceira: <strong>{product.storeName}</strong></p>}
      {hasListPrice && product.listPrice && (
        <div className="pricing-list-price">
          <span>De</span>
          <s>{formatMoneyBRL(product.listPrice)}</s>
          <span className="pricing-discount">{discount > 0 ? `${discount}% OFF` : "Menos de 1% OFF"}</span>
        </div>
      )}
      <div className="pricing-cash">
        <span>À vista</span>
        <strong>{formatMoneyBRL(product.price)}</strong>
      </div>
      {product.pixPrice && (
        <div className="pricing-payment-row">
          <span>No Pix</span>
          <strong>{formatMoneyBRL(product.pixPrice)}</strong>
        </div>
      )}
      {hasCardTerms && product.cardInstallmentPrice && product.installments !== null && (
        <div className="pricing-card-block">
          <div className="pricing-payment-row">
            <span>No cartão</span>
            <div className="pricing-card-value">
              <strong>{product.installments}x de {formatMoneyBRL(product.cardInstallmentPrice)}</strong>
              <small>
                {product.cardInterestFree === true ? "sem juros" : product.cardInterestFree === false ? "com juros" : "juros não informados"}
              </small>
            </div>
          </div>
          <p className="pricing-card-total">Total no cartão: <strong>{formatMoneyBRL(multiplyPriceStringByCount(product.cardInstallmentPrice, product.installments))}</strong></p>
        </div>
      )}
      {product.shippingInfo && <p className="pricing-note"><strong>Frete/entrega:</strong> {product.shippingInfo}</p>}
      {product.promotionInfo && <p className="pricing-note">{product.promotionInfo}</p>}
    </div>
  );
}
