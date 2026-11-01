import Brand from "@/components/Brand";
import ProductPricing from "@/components/ProductPricing";
import { trpc } from "@/lib/trpc";
import { buildProductPath } from "@shared/product-url";
import { ArrowLeft, BadgeInfo, ExternalLink, Image as ImageIcon } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";
import NotFound from "./NotFound";

export default function ProductDetailPage({ id, slug }: { id: number; slug?: string }) {
  const productQuery = trpc.products.byId.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0 });

  useEffect(() => {
    const product = productQuery.data;
    if (!product) return;

    const canonicalPath = buildProductPath(product.id, product.title);
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState(window.history.state, "", canonicalPath);
    }

    const previousTitle = document.title;
    const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = descriptionMeta?.content;
    const meta = descriptionMeta ?? document.createElement("meta");
    if (!descriptionMeta) {
      meta.name = "description";
      document.head.append(meta);
    }
    document.title = `${product.title} | Vitrine`;
    meta.content = product.description.slice(0, 160);

    return () => {
      document.title = previousTitle;
      if (descriptionMeta && previousDescription !== undefined) {
        descriptionMeta.content = previousDescription;
      } else if (!descriptionMeta) {
        meta.remove();
      }
    };
  }, [productQuery.data, id, slug]);

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
          <ProductPricing product={product} />
          <a className="buy-button detail-buy" href={product.affiliateUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">
            Compre aqui <ExternalLink aria-hidden="true" />
          </a>
          <p className="detail-note">Você continuará para a loja parceira para concluir a compra. Preços, frete, estoque e condições podem mudar; confirme o valor final no checkout. Este site pode receber comissão por este link de afiliado, sem custo adicional.</p>
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <span className="footer-disclosure">A compra é concluída no site da loja parceira; esta vitrine é independente.</span>
      </footer>
    </div>
  );
}
