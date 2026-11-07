import Brand from "@/components/Brand";
import { startLogin } from "@/const";
import type { RouterOutputs } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { inferAffiliateStoreName } from "@shared/affiliate-url";
import { getPublicProductAvailability, PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS } from "@shared/product-monitor";
import { formatMoneyBRL } from "@shared/price";
import { ArrowLeft, ExternalLink, Image as ImageIcon, LoaderCircle, LogOut, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

type AdminProduct = RouterOutputs["admin"]["list"][number];
type MarketplaceProvider = RouterOutputs["admin"]["marketplaceProviders"][number];
type MarketplaceStatus = RouterOutputs["admin"]["marketplaceStatus"];

function formatMonitorDate(value: Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function availabilityText(status: string) {
  if (status === "available") return "Disponível";
  if (status === "out_of_stock") return "Fora de estoque";
  if (status === "unavailable") return "Indisponível";
  return "Disponibilidade não confirmada";
}

export default function AdminMonitoringPage() {
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const authProviders = trpc.auth.providers.useQuery();
  const logout = trpc.auth.logout.useMutation();
  const authorized = auth.data?.isAdmin === true;
  const marketplaceProviders = trpc.admin.marketplaceProviders.useQuery(undefined, { enabled: authorized });
  const marketplaceStatus = trpc.admin.marketplaceStatus.useQuery(undefined, { enabled: authorized });
  const products = trpc.admin.list.useQuery(undefined, { enabled: authorized });
  const connectMercadoLivre = trpc.admin.connectMercadoLivre.useMutation();
  const disconnectMercadoLivre = trpc.admin.disconnectMercadoLivre.useMutation();
  const configureMonitorSchedule = trpc.admin.configureMonitorSchedule.useMutation();
  const disableMonitorSchedule = trpc.admin.disableMonitorSchedule.useMutation();
  const utils = trpc.useUtils();
  const [loginError, setLoginError] = useState("");
  const [monitorMessage, setMonitorMessage] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const googleStatus = url.searchParams.get("google");
    if (googleStatus === "error") setLoginError("Não foi possível concluir o login com Google. Tente novamente.");
    else if (googleStatus === "cancelled") setLoginError("O login com Google foi cancelado.");
    else if (googleStatus === "unavailable") setLoginError("O login com Google ainda não está configurado neste ambiente.");
    else if (googleStatus === "unauthorized") setLoginError("Entre com o e-mail Google autorizado para administrar esta vitrine.");

    const marketplaceResult = url.searchParams.get("mercadolivre");
    if (marketplaceResult === "connected") {
      setMonitorMessage("Conta do Mercado Livre conectada.");
      void marketplaceStatus.refetch();
    } else if (marketplaceResult === "cancelled") {
      setMonitorMessage("A autorização do Mercado Livre foi cancelada.");
    } else if (marketplaceResult === "unavailable") {
      setMonitorMessage("A integração do Mercado Livre não está configurada para este ambiente.");
    } else if (marketplaceResult) {
      setMonitorMessage("Não foi possível concluir a conexão com o Mercado Livre.");
    }

    if (marketplaceResult) {
      url.searchParams.delete("mercadolivre");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  async function startMercadoLivreConnection() {
    setMonitorMessage("");
    try {
      const result = await connectMercadoLivre.mutateAsync(undefined);
      window.location.assign(result.authorizationUrl);
    } catch {
      setMonitorMessage("Não foi possível iniciar a conexão com o Mercado Livre.");
    }
  }

  async function toggleMonitorSchedule() {
    const status = marketplaceStatus.data;
    if (!status?.isProduction || !status.configured || !status.connected) return;

    setMonitorMessage("");
    try {
      if (status.scheduleEnabled) await disableMonitorSchedule.mutateAsync(undefined);
      else await configureMonitorSchedule.mutateAsync(undefined);
      await marketplaceStatus.refetch();
      setMonitorMessage("Agendamento atualizado.");
    } catch {
      setMonitorMessage("Não foi possível atualizar o agendamento agora.");
    }
  }

  async function disconnectMarketplace() {
    if (!window.confirm("Desconectar Mercado Livre e reiniciar os estados de disponibilidade monitorados?")) return;

    setMonitorMessage("");
    try {
      await disconnectMercadoLivre.mutateAsync(undefined);
      await Promise.all([marketplaceStatus.refetch(), utils.admin.list.invalidate(), utils.products.list.invalidate()]);
      setMonitorMessage("Conta desconectada. Os produtos continuam visíveis com disponibilidade aguardando nova verificação.");
    } catch {
      setMonitorMessage("Não foi possível desconectar o Mercado Livre agora.");
    }
  }

  async function refreshProducts(productId?: number) {
    const invalidations = [utils.admin.list.invalidate(), utils.products.list.invalidate()];
    if (productId) invalidations.push(utils.products.byId.invalidate({ id: productId }));
    await Promise.all(invalidations);
  }

  if (auth.isLoading) {
    return <div className="site-shell"><div className="state-panel"><div><LoaderCircle className="animate-spin" aria-hidden="true" /><h2>Verificando acesso</h2><p>A área administrativa é restrita.</p></div></div></div>;
  }

  if (!auth.data) {
    return (
      <div className="site-shell">
        <header className="admin-top"><Brand /><Link className="back-link" href="/"><ArrowLeft aria-hidden="true" /> Voltar à vitrine</Link></header>
        <main className="state-panel">
          <div>
            <LogOut aria-hidden="true" />
            <h2>Entre para acessar o monitoramento</h2>
            <p>Use a conta Google autorizada ou sua conta Manus para administrar as verificações das lojas.</p>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            <div className="login-options">
              {authProviders.data?.google && <a className="state-action google-action" href="/api/oauth/google/start"><span className="google-mark" aria-hidden="true">G</span>Entrar com Google</a>}
              <button className="state-action" onClick={() => { try { startLogin(); } catch { setLoginError("Não foi possível iniciar o login. Tente novamente."); } }}>Entrar com Manus</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="site-shell">
        <header className="admin-top"><Brand /><Link className="back-link" href="/"><ArrowLeft aria-hidden="true" /> Voltar à vitrine</Link></header>
        <main className="state-panel"><div><LogOut aria-hidden="true" /><h2>Acesso não autorizado</h2><p>Esta conta não está configurada como administradora desta vitrine.</p><button className="state-action" onClick={() => void logout.mutateAsync()}>Sair desta conta</button></div></main>
      </div>
    );
  }

  const status = marketplaceStatus.data;
  const canVerifyProducts = Boolean(status?.isProduction && status.configured && status.connected);

  return (
    <div className="site-shell admin-shell">
      <header className="admin-top">
        <Brand />
        <div className="admin-top-actions">
          <Link className="back-link" href="/admin">Cadastro</Link>
          <button className="text-button" onClick={() => void logout.mutateAsync()}><LogOut size={14} aria-hidden="true" /> Sair</button>
          <Link className="back-link" href="/"><ArrowLeft aria-hidden="true" /> Vitrine</Link>
        </div>
      </header>

      <main>
        <section className="admin-heading">
          <p className="kicker">Área restrita</p>
          <h1>Monitoramento de produtos.</h1>
          <p>Configure a origem que será consultada, separada do link de afiliado usado no botão “Compre aqui”.</p>
        </section>

        <section className="admin-panel monitor-status-panel" aria-labelledby="marketplace-status-title">
          <div className="monitor-panel-heading">
            <div><h2 id="marketplace-status-title">Conexão e rotina do Mercado Livre</h2><p>O worker verifica itens vencidos a cada 15 minutos; consultas bem-sucedidas são espaçadas por seis horas e falhas usam backoff.</p></div>
            {status && <span className={`monitor-environment${status.isProduction ? " is-production" : ""}`}>{status.isProduction ? "Produção" : "Ambiente de teste"}</span>}
          </div>
          {marketplaceStatus.isLoading ? <p className="form-hint">Carregando estado da conexão…</p> : marketplaceStatus.error ? <p className="form-error" role="status">Não foi possível carregar o estado da conexão.</p> : status && (
            <>
              <div className="monitor-status-grid">
                <div><span>Credenciais</span><strong>{status.configured ? "Configuradas" : "Não configuradas"}</strong></div>
                <div><span>Conta Mercado Livre</span><strong>{status.connected ? "Conectada" : "Não conectada"}</strong></div>
                <div><span>Agendamento</span><strong>{status.scheduleEnabled ? "Ativo" : "Inativo"}</strong></div>
              </div>
              <div className="monitor-controls">
                <button className="small-button" type="button" onClick={() => void startMercadoLivreConnection()} disabled={!status.configured || status.connected || connectMercadoLivre.isPending}>
                  {connectMercadoLivre.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}
                  {status.connected ? "Conta conectada" : "Conectar Mercado Livre"}
                </button>
                <button className="small-button" type="button" onClick={() => void toggleMonitorSchedule()} disabled={!status.isProduction || !status.configured || !status.connected || configureMonitorSchedule.isPending || disableMonitorSchedule.isPending}>
                  {(configureMonitorSchedule.isPending || disableMonitorSchedule.isPending) && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                  {status.scheduleEnabled ? "Desativar agendamento" : "Ativar agendamento"}
                </button>
                {status.connected && <button className="small-button" type="button" onClick={() => void disconnectMarketplace()} disabled={disconnectMercadoLivre.isPending || disableMonitorSchedule.isPending}>
                  {disconnectMercadoLivre.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                  Desconectar conta
                </button>}
              </div>
              {!status.configured && <p className="form-hint">A conexão só pode ser iniciada após configurar as credenciais protegidas da aplicação.</p>}
              {!status.isProduction && <p className="form-hint">Ações de agendamento e verificação manual ficam disponíveis somente na versão publicada.</p>}
            </>
          )}
          {monitorMessage && <p className="form-hint monitor-message" role="status">{monitorMessage}</p>}
        </section>

        <section className="admin-panel monitor-provider-note" aria-label="Lojas aceitas e lojas monitoráveis">
          <h2>Links de outras lojas</h2>
          <p>Links de afiliado da Shopee e de qualquer loja HTTPS continuam válidos no cadastro e no botão de compra. O monitor automático só aparece para lojas com adaptador oficial; neste momento, Mercado Livre é o único provedor conectado. Não fazemos raspagem de páginas de produto.</p>
        </section>

        <section className="admin-panel monitor-products-panel" aria-labelledby="monitor-products-title">
          <div className="monitor-panel-heading">
            <div><h2 id="monitor-products-title">Produtos do catálogo</h2><p>Edite aqui a URL canônica e o provedor monitorado. Essa URL não substitui nem altera o link de afiliado.</p></div>
          </div>
          {products.isLoading || marketplaceProviders.isLoading ? <div className="admin-empty">Carregando produtos e provedores…</div> : products.error ? (
            <div className="admin-empty">Não foi possível carregar os produtos.<br /><button className="text-button" type="button" onClick={() => void products.refetch()}>Tentar novamente</button></div>
          ) : marketplaceProviders.error ? <div className="admin-empty">Não foi possível carregar os provedores de monitoramento.</div> : products.data?.length ? (
            <div className="monitor-product-list">
              {products.data.map(product => <MonitorProductRow key={product.id} product={product} providers={marketplaceProviders.data ?? []} canVerify={canVerifyProducts} onChanged={refreshProducts} />)}
            </div>
          ) : <div className="admin-empty"><ImageIcon aria-hidden="true" /><br />Nenhum produto cadastrado ainda.</div>}
        </section>
      </main>
    </div>
  );
}

function MonitorProductRow({
  product,
  providers,
  canVerify,
  onChanged,
}: {
  product: AdminProduct;
  providers: MarketplaceProvider[];
  canVerify: boolean;
  onChanged: (productId?: number) => Promise<void>;
}) {
  const updateMonitorSettings = trpc.admin.updateMonitorSettings.useMutation();
  const syncProduct = trpc.admin.syncProductNow.useMutation();
  const utils = trpc.useUtils();
  const [sourceProvider, setSourceProvider] = useState(product.sourceProvider || "manual");
  const [sourceUrl, setSourceUrl] = useState(product.sourceUrl ?? "");
  const [monitorEnabled, setMonitorEnabled] = useState(product.monitorEnabled);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSourceProvider(product.sourceProvider || "manual");
    setSourceUrl(product.sourceUrl ?? "");
    setMonitorEnabled(product.monitorEnabled);
  }, [product.sourceProvider, product.sourceUrl, product.monitorEnabled]);

  const providerSupported = providers.some(provider => provider.id === sourceProvider);
  const hasUnsavedSettings = sourceProvider !== product.sourceProvider || sourceUrl !== (product.sourceUrl ?? "") || monitorEnabled !== product.monitorEnabled;
  const checkedAt = formatMonitorDate(product.lastCheckedAt);
  const currentAvailability = getPublicProductAvailability(product.availabilityStatus, product.lastCheckedAt);
  const affiliateStore = product.storeName || inferAffiliateStoreName(product.affiliateUrl) || "Loja parceira";
  const canCheckThisProduct = canVerify && product.monitorEnabled && providers.some(provider => provider.id === product.sourceProvider) && !hasUnsavedSettings;

  async function saveSettings(resumeNow = false) {
    setError("");
    setMessage("");
    try {
      await updateMonitorSettings.mutateAsync({
        id: product.id,
        sourceProvider,
        sourceUrl: sourceUrl.trim() || null,
        monitorEnabled,
        resumeNow,
      });
      await onChanged(product.id);
      setMessage(resumeNow ? "Monitoramento retomado; a última disponibilidade válida foi mantida." : "Configuração do monitor atualizada.");
    } catch {
      setError("Não foi possível salvar. Confira se a loja oferece monitoramento e se a URL canônica está correta.");
    }
  }

  async function verifyNow() {
    setError("");
    setMessage("");
    try {
      await syncProduct.mutateAsync({ id: product.id });
      await Promise.all([onChanged(product.id), utils.products.byId.invalidate({ id: product.id })]);
      setMessage("Verificação concluída.");
    } catch {
      setError("Não foi possível concluir a verificação. O último preço e a última disponibilidade válidos foram mantidos.");
    }
  }

  const currentProviderMissing = sourceProvider !== "manual" && !providerSupported;
  const paused = product.syncFailureCount >= PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS;

  return (
    <article className="monitor-product-card">
      <div className="monitor-product-heading">
        <div className="admin-thumb"><img src={product.imageUrl} alt="" loading="lazy" decoding="async" /></div>
        <div>
          <h3>{product.title}</h3>
          <p>{product.category} · {formatMoneyBRL(product.price)} · Link de compra: {affiliateStore}</p>
          <span className={`admin-row-status${product.isActive ? "" : " is-hidden"}`}>{product.isActive ? "Visível na vitrine" : "Oculto"}</span>
        </div>
      </div>

      <div className="monitor-product-fields">
        <div className="form-field">
          <label htmlFor={`monitor-provider-${product.id}`}>Provedor monitorado</label>
          <select
            id={`monitor-provider-${product.id}`}
            value={sourceProvider}
            disabled={updateMonitorSettings.isPending}
            onChange={event => {
              const value = event.target.value;
              setSourceProvider(value);
              if (value === "manual") {
                setMonitorEnabled(false);
                setSourceUrl("");
              }
            }}
          >
            <option value="manual">Sem monitor automático</option>
            {providers.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
            {currentProviderMissing && <option value={sourceProvider}>Adaptador indisponível ({sourceProvider})</option>}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`monitor-source-${product.id}`}>URL canônica da origem (não afiliada)</label>
          <input
            id={`monitor-source-${product.id}`}
            type="url"
            pattern="https://.*"
            maxLength={2048}
            required={monitorEnabled}
            disabled={sourceProvider === "manual" || updateMonitorSettings.isPending}
            value={sourceUrl}
            onChange={event => setSourceUrl(event.target.value)}
            placeholder="https://www.loja.com.br/produto/..."
          />
          <span className="form-hint">Esta é a página original do item monitorado. O link de afiliado permanece intacto como destino de compra.</span>
        </div>
      </div>

      <div className="monitor-product-status">
        <label className="form-checkbox"><input type="checkbox" checked={monitorEnabled} disabled={!providerSupported || sourceProvider === "manual" || updateMonitorSettings.isPending} onChange={event => setMonitorEnabled(event.target.checked)} /> Ativar monitor deste produto</label>
        {product.monitorEnabled ? (
          <span className={`availability-badge availability-${currentAvailability}`}>{availabilityText(currentAvailability)}</span>
        ) : <span className="monitor-environment">Monitor desativado</span>}
        {checkedAt && <span className="availability-checked">Última verificação: {checkedAt}</span>}
        {paused && product.monitorEnabled && <span className="monitor-generic-error">Pausado após {PRODUCT_MONITOR_MAX_FAILURE_ATTEMPTS} falhas; ajuste a configuração e retome.</span>}
        {!paused && product.lastSyncError && <span className="monitor-generic-error">A última tentativa falhou; os valores válidos foram preservados.</span>}
      </div>

      <div className="monitor-product-actions">
        <button className="small-button" type="button" onClick={() => void saveSettings()} disabled={updateMonitorSettings.isPending || !hasUnsavedSettings}>
          {updateMonitorSettings.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          Salvar configuração
        </button>
        {paused && product.monitorEnabled && !hasUnsavedSettings && <button className="small-button" type="button" onClick={() => void saveSettings(true)} disabled={updateMonitorSettings.isPending}>Retomar monitor</button>}
        {product.monitorEnabled && <button className="small-button" type="button" onClick={() => void verifyNow()} disabled={!canCheckThisProduct || syncProduct.isPending} title={!canVerify ? "A verificação manual requer a conexão em produção." : undefined}>
          {syncProduct.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          Verificar agora
        </button>}
        <a className="small-button" href={product.affiliateUrl} target="_blank" rel="nofollow sponsored noopener noreferrer" aria-label={`Abrir link de afiliado de ${product.title}`}><ExternalLink aria-hidden="true" /> Abrir link de compra</a>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
    </article>
  );
}
