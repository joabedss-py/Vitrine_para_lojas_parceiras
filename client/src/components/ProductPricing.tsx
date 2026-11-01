import type { CatalogProduct } from "@/lib/trpc";
import { comparePriceStrings, formatMoneyBRL, getDiscountPercentage, multiplyPriceStringByCount } from "@shared/price";
import { getPublicProductAvailability } from "@shared/product-monitor";
import { ExternalLink } from "lucide-react";

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
  | "monitorEnabled"
  | "availabilityStatus"
  | "lastCheckedAt"
>;

function formatCheckedAt(value: Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function ProductPricing({ product, compact = false }: { product: PricingProduct; compact?: boolean }) {
  const hasListPrice = Boolean(product.listPrice && comparePriceStrings(product.listPrice, product.price) > 0);
  const discount = hasListPrice && product.listPrice ? getDiscountPercentage(product.listPrice, product.price) : 0;
  const hasCardTerms = Boolean(product.cardInstallmentPrice) && product.installments !== null;
  const availabilityStatus = getPublicProductAvailability(product.availabilityStatus, product.lastCheckedAt);
  const availabilityLabel = availabilityStatus === "available"
    ? "Disponível"
    : availabilityStatus === "out_of_stock"
      ? "Fora de estoque"
      : availabilityStatus === "unavailable"
        ? "Indisponível"
        : "Disponibilidade não confirmada";
  const checkedAt = product.lastCheckedAt ? formatCheckedAt(product.lastCheckedAt) : null;

  return (
    <div className={`product-pricing${compact ? " is-compact" : ""}`}>
      {product.monitorEnabled && (
        <div className="availability-info" aria-live="polite">
          <span className={`availability-badge availability-${availabilityStatus}`}>{availabilityLabel}</span>
          {checkedAt && <span className="availability-checked">Última verificação em {checkedAt}</span>}
        </div>
      )}
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
          <p className="pricing-card-total">Total no cartão em {product.installments} parcelas: <strong>{formatMoneyBRL(multiplyPriceStringByCount(product.cardInstallmentPrice, product.installments))}</strong></p>
        </div>
      )}
      {product.monitorEnabled && (product.pixPrice || hasCardTerms) && <p className="pricing-note pricing-manual-terms">Pix e parcelas informados manualmente; confirme as condições atuais na loja.</p>}
      {product.monitorEnabled && availabilityStatus === "unknown" && <p className="pricing-note">Preço e disponibilidade não foram confirmados recentemente; confira no site da loja.</p>}
      {product.shippingInfo && <p className="pricing-note"><strong>Frete/entrega:</strong> {product.shippingInfo}</p>}
      {product.promotionInfo && <p className="pricing-note">{product.promotionInfo}</p>}
    </div>
  );
}

export function ProductBuyButton({ product, className = "" }: { product: Pick<CatalogProduct, "affiliateUrl" | "monitorEnabled" | "availabilityStatus" | "lastCheckedAt">; className?: string }) {
  const availabilityStatus = getPublicProductAvailability(product.availabilityStatus, product.lastCheckedAt);
  const outOfStock = product.monitorEnabled && availabilityStatus === "out_of_stock";
  const unavailable = product.monitorEnabled && availabilityStatus === "unavailable";
  const unconfirmed = product.monitorEnabled && availabilityStatus === "unknown";
  const disabled = outOfStock || unavailable;
  const label = outOfStock ? "Compre aqui — fora de estoque" : unavailable ? "Compre aqui — indisponível" : unconfirmed ? "Compre aqui — confirme a disponibilidade na loja" : "Compre aqui";

  if (disabled) {
    return (
      <button className={`buy-button is-disabled ${className}`.trim()} type="button" disabled aria-label={label}>
        Compre aqui <ExternalLink aria-hidden="true" />
      </button>
    );
  }

  return (
    <a className={`buy-button ${className}`.trim()} href={product.affiliateUrl} target="_blank" rel="nofollow sponsored noopener noreferrer" aria-label={unconfirmed ? label : undefined}>
      Compre aqui <ExternalLink aria-hidden="true" />
    </a>
  );
}
