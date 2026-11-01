import { mercadoLivreProvider } from "./mercadoLivre";
import { MarketplaceProviderError, type MarketplaceProvider } from "./types";

const providers: Readonly<Record<string, MarketplaceProvider>> = {
  [mercadoLivreProvider.id]: mercadoLivreProvider,
};

export function getMarketplaceProvider(providerId: string): MarketplaceProvider {
  const provider = providers[providerId];
  if (!provider) throw new MarketplaceProviderError("invalid_source", "Este e-commerce ainda não possui um adaptador de monitoramento.");
  return provider;
}

export function listMarketplaceProviders() {
  return Object.values(providers).map(provider => ({ id: provider.id, label: provider.label }));
}
