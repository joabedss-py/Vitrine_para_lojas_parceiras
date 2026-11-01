import Brand from "@/components/Brand";
import ProductPricing from "@/components/ProductPricing";
import type { CatalogProduct } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { buildProductPath } from "@shared/product-url";
import { ArrowUpRight, BadgeInfo, ExternalLink, Search, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

const PRODUCT_PAGE_SIZE = 12;

function ProductCard({ product }: { product: CatalogProduct }) {
  const productPath = buildProductPath(product.id);
  return (
    <article className="product-card">
      <Link href={productPath} className="product-image-link" aria-label={`Ver detalhes de ${product.title}`}>
        <img className="product-image" src={product.imageUrl} alt={product.title} loading="lazy" decoding="async" />
        <span className="product-category">{product.category}</span>
      </Link>
      <div className="product-card-body">
        <h3 className="product-card-title"><Link href={productPath}>{product.title}</Link></h3>
        <p className="product-card-description">{product.description}</p>
        <ProductPricing product={product} compact />
        <a className="buy-button" href={product.affiliateUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">
          Compre aqui <ExternalLink aria-hidden="true" />
        </a>
        <Link className="card-detail-link" href={productPath}>Ver detalhes do produto</Link>
      </div>
    </article>
  );
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const productsQuery = trpc.products.list.useQuery({
    search: debouncedSearch || undefined,
    category: category || undefined,
    limit: PRODUCT_PAGE_SIZE + 1,
    offset: page * PRODUCT_PAGE_SIZE,
  });
  const categoriesQuery = trpc.products.categories.useQuery();
  const pageResults = productsQuery.data ?? [];
  const hasMore = pageResults.length > PRODUCT_PAGE_SIZE;
  const products = pageResults.slice(0, PRODUCT_PAGE_SIZE);

  return (
    <div className="site-shell">
      <header className="site-header">
        <Brand />
        <nav className="header-actions" aria-label="Navegação principal">
          <a className="header-link" href="#catalogo">Produtos <ArrowUpRight aria-hidden="true" /></a>
          <Link className="header-link" href="/admin">Área administrativa</Link>
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <p className="kicker">Seleção independente</p>
            <h1 id="hero-title">Boas escolhas, <em>sem complicação.</em></h1>
          </div>
          <div className="hero-copy">
            <strong>Uma vitrine feita para descobrir.</strong>
            Encontre produtos selecionados, confira os preços e as condições e siga para a loja parceira.
          </div>
        </section>

        <section className="catalog-section" id="catalogo" aria-labelledby="catalog-heading">
          <div className="catalog-heading">
            <div>
              <p className="kicker">Explore a seleção</p>
              <h2 id="catalog-heading">Produtos em destaque</h2>
              <p>Veja os detalhes antes de seguir para a loja.</p>
            </div>
            {products.length > 0 && <span className="result-count">{products.length} {hasMore ? "nesta página" : products.length === 1 ? "produto" : "produtos"}</span>}
          </div>

          <div className="catalog-controls">
            <label className="search-box">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={search}
                maxLength={100}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar produtos..."
                aria-label="Buscar produtos"
              />
            </label>
            <div className="category-list" aria-label="Filtrar por categoria">
              <button className={`category-chip${category === "" ? " is-selected" : ""}`} onClick={() => { setCategory(""); setPage(0); }}>Todas</button>
              {(categoriesQuery.data ?? []).map(item => (
                <button key={item} className={`category-chip${category === item ? " is-selected" : ""}`} onClick={() => { setCategory(item); setPage(0); }}>{item}</button>
              ))}
            </div>
          </div>

          {productsQuery.isLoading ? (
            <div className="state-panel"><div><ShoppingBag aria-hidden="true" /><h2>Carregando produtos</h2><p>Estamos preparando a vitrine para você.</p></div></div>
          ) : productsQuery.error ? (
            <div className="state-panel"><div><BadgeInfo aria-hidden="true" /><h2>Não foi possível carregar a vitrine</h2><p>Tente novamente em alguns instantes.</p><button className="state-action" onClick={() => void productsQuery.refetch()}>Tentar novamente</button></div></div>
          ) : products.length === 0 ? (
            <div className="state-panel"><div><ShoppingBag aria-hidden="true" /><h2>{search || category ? "Nenhum produto encontrado" : "A vitrine está sendo preparada"}</h2><p>{search || category ? "Experimente mudar a busca ou escolher outra categoria." : "Em breve, esta seleção terá produtos com imagens, detalhes e links para lojas parceiras."}</p>{(search || category) && <button className="state-action" onClick={() => { setSearch(""); setCategory(""); setPage(0); }}>Limpar filtros</button>}</div></div>
          ) : (
            <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>
          )}

          {productsQuery.isSuccess && (page > 0 || hasMore) && (
            <nav className="catalog-pagination" aria-label="Paginação de produtos">
              <button className="small-button" type="button" disabled={page === 0 || productsQuery.isFetching} onClick={() => setPage(current => Math.max(0, current - 1))}>Anterior</button>
              <span>Página {page + 1}</span>
              <button className="small-button" type="button" disabled={!hasMore || productsQuery.isFetching} onClick={() => setPage(current => current + 1)}>Próxima</button>
            </nav>
          )}

          <aside className="disclosure-banner">
            <BadgeInfo aria-hidden="true" />
            <span><strong>Transparência:</strong> alguns links desta vitrine são de afiliado. Podemos receber uma comissão se você comprar por eles, sem custo adicional. Preços, frete, estoque e condições podem mudar; confirme os detalhes no site da loja.</span>
          </aside>
        </section>
      </main>

      <footer className="site-footer">
        <Brand />
        <span className="footer-disclosure">Vitrine independente. Os produtos e links são cadastrados pelo administrador; a compra é concluída no site da loja parceira.</span>
      </footer>
    </div>
  );
}
