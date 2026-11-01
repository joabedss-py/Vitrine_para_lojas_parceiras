import Brand from "@/components/Brand";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BadgeInfo, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";
import NotFound from "./NotFound";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function ProductDetailPage({ id }: { id: number }) {
  const productQuery = trpc.products.byId.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0 });

  if (!Number.isInteger(id) || id <= 0) return <NotFound />;
  if (productQuery.isLoading) {
    return <div className="site-shell"><div className="state-panel"><div><ImageIcon aria-hidden="true" /><h2>Carregando produto</h2><p>Um instante enquanto buscamos os detalhes.</p></div></div></div>;
  }
  if (productQuery.error?.data?.code === "NOT_FOUND") return <NotFound />;
  if (productQuery.error || !productQuery.data) {
    return <div className="site-shell"><div className="state-panel"><div><BadgeInfo aria-hidden="true" /><h2>Não foi possível carregar este produto</h2><p>{productQuery.error?.message ?? "Tente novamente em alguns instantes."}</p><button className="state-action" onClick={() => void productQuery.refetch()}>Tentar novamente</button></div></div></div>;
  }

  const product = productQuery.data;
  return (
    <div className="site-shell">
      <header className="site-header">
        <Brand />
        <Link className="header-link" href="/">Voltar à vitrine</Link>
      </header>
      <div className="page-topline">
        <Link href="/" className="back-link"><ArrowLeft aria-hidden="true" /> Voltar para os produtos</Link>
        <span>Detalhes do produto</span>
      </div>
      <main className="detail-layout">
        <div className="detail-image-frame">
          <img className="detail-image" src={product.imageUrl} alt={product.title} decoding="async" fetchPriority="high" />
        </div>
        <section className="detail-copy" aria-labelledby="product-title">
          <span className="detail-category">{product.category}</span>
          <h1 id="product-title">{product.title}</h1>
          <p className="detail-description">{product.description}</p>
          <p className="detail-price">{money.format(Number(product.price))}</p>
          <a className="buy-button detail-buy" href={product.affiliateUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">
            Compre aqui <ExternalLink aria-hidden="true" />
          </a>
          <p className="detail-note">Você continuará para o Mercado Livre para concluir a compra. Este site pode receber comissão por este link de afiliado, sem custo adicional para você.</p>
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <span className="footer-disclosure">A compra é feita no Mercado Livre; esta vitrine é independente.</span>
      </footer>
    </div>
  );
}
