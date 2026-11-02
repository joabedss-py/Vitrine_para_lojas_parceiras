export type CommercialClassification = "good_offer" | "normal_price" | "high_price" | "insufficient_history";

export type CommercialObservation = {
  currentPrice: string;
  checkedAt: Date | string | number;
};

export type CommercialStats = {
  classification: CommercialClassification;
  justification: string;
  observationCount: number;
  coveredDays: number;
  minimumPrice: number | null;
  maximumPrice: number | null;
  averagePrice: number | null;
  currentPrice: number;
  variationPercent: number | null;
  periods: Record<7 | 30 | 90 | 180, { averagePrice: number; variationPercent: number } | null>;
};

const MINIMUM_OBSERVATIONS = 3;
const MINIMUM_COVERAGE_DAYS = 7;
const WINDOWS = [7, 30, 90, 180] as const;

function toPrice(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toTime(value: Date | string | number) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function percent(current: number, reference: number) {
  return reference === 0 ? null : ((current - reference) / reference) * 100;
}

export function analyzeCommercialHistory(observations: CommercialObservation[], now = new Date()): CommercialStats | null {
  const currentPrice = toPrice(observations.at(-1)?.currentPrice);
  if (currentPrice === null) return null;

  const normalized = observations
    .map(observation => ({ price: toPrice(observation.currentPrice), time: toTime(observation.checkedAt) }))
    .filter((observation): observation is { price: number; time: number } => observation.price !== null && observation.time !== null)
    .sort((a, b) => a.time - b.time);
  const nowMs = now.getTime();
  const firstTime = normalized[0]?.time ?? nowMs;
  const coveredDays = Math.max(0, (nowMs - firstTime) / 86_400_000);
  const prices = normalized.map(observation => observation.price);
  const minimumPrice = prices.length ? Math.min(...prices) : null;
  const maximumPrice = prices.length ? Math.max(...prices) : null;
  const averagePrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;
  const periods = Object.fromEntries(WINDOWS.map(days => {
    const cutoff = nowMs - days * 86_400_000;
    const windowPrices = normalized.filter(observation => observation.time >= cutoff).map(observation => observation.price);
    if (windowPrices.length < 2) return [days, null];
    const reference = windowPrices.reduce((sum, price) => sum + price, 0) / windowPrices.length;
    return [days, { averagePrice: reference, variationPercent: percent(currentPrice, reference) ?? 0 }];
  })) as CommercialStats["periods"];

  if (normalized.length < MINIMUM_OBSERVATIONS || coveredDays < MINIMUM_COVERAGE_DAYS || averagePrice === null || minimumPrice === null || maximumPrice === null) {
    return {
      classification: "insufficient_history",
      justification: `Histórico insuficiente: ${normalized.length} observação(ões) em ${coveredDays.toFixed(0)} dia(s); são necessárias pelo menos ${MINIMUM_OBSERVATIONS} observações e ${MINIMUM_COVERAGE_DAYS} dias de cobertura.`,
      observationCount: normalized.length,
      coveredDays,
      minimumPrice,
      maximumPrice,
      averagePrice,
      currentPrice,
      variationPercent: averagePrice === null ? null : percent(currentPrice, averagePrice),
      periods,
    };
  }

  const variationPercent = percent(currentPrice, averagePrice) ?? 0;
  const classification = variationPercent <= -10 ? "good_offer" : variationPercent >= 10 ? "high_price" : "normal_price";
  const labels = { good_offer: "Boa oferta", normal_price: "Preço normal", high_price: "Preço elevado", insufficient_history: "Histórico insuficiente" };
  const direction = variationPercent < 0 ? "abaixo" : variationPercent > 0 ? "acima" : "próximo";
  return {
    classification,
    justification: `Preço atual de R$ ${currentPrice.toFixed(2)} está ${Math.abs(variationPercent).toFixed(1)}% ${direction} da média histórica de R$ ${averagePrice.toFixed(2)} (${normalized.length} observações em ${coveredDays.toFixed(0)} dias). Classificação: ${labels[classification]}.`,
    observationCount: normalized.length,
    coveredDays,
    minimumPrice,
    maximumPrice,
    averagePrice,
    currentPrice,
    variationPercent,
    periods,
  };
}

export function buildCommercialAlertKey(productId: number, type: string, eventAt: Date) {
  return `${productId}:${type}:${eventAt.toISOString()}`;
}
