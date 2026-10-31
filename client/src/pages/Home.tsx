import Brand from "@/components/Brand";
import type { CatalogProduct } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, BadgeInfo, ExternalLink, Search, ShoppingBag } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link } from "wouter";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <article className="product-card">
      <Link href={`/produto/${product.id}`} className="product-image-link" aria-label={`Ver detalhes de ${product.title}`}>
        <img className="product-image" src={product.imageUrl} alt={product.title} loading="lazy" />
        <span className="product-category">{product.category}</span>
      </Link>
      <div className="product-card-body">
        <h3 className="product-card-title"><Link href={`/produto/${product.id}`}>{product.title}</Link></h3>
        <p className="product-card-description">{product.description}</p>
        <p className="product-price">{money.format(Number(product.price))}</p>
        <a className="buy-button" href={product.affiliateUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">
          Compre aqui <ExternalLink aria-hidden="true" />
        </a>
        <Link className="card-detail-link" href={`/produto/${product.id}`}>Ver detalhes do produto</Link>
      </div>
    </article>
  );
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const productsQuery = trpc.products.list.useQuery({
    search: deferredSearch || undefined,
    category: category || undefined,
  });
  const categoriesQuery = trpc.products.categories.useQuery();
  const products = productsQuery.data ?? [];

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
            Encontre produtos selecionados, confira os detalhes e siga para comprar no Mercado Livre.
          </div>
        </section>

        <section className="catalog-section" id="catalogo" aria-labelledby="catalog-heading">
          <div className="catalog-heading">
            <div>
              <p className="kicker">Explore a seleção</p>
              <h2 id="catalog-heading">Produtos em destaque</h2>
              <p>Veja os detalhes antes de seguir para a loja.</p>
            </div>
            {products.length > 0 && <span className="result-count">{products.length} {products.length === 1 ? "produto" : "produtos"}</span>}
          </div>

          <div className="catalog-controls">
            <label className="search-box">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar produtos..."
                aria-label="Buscar produtos"
              />
            </label>
            <div className="category-list" aria-label="Filtrar por categoria">
              <button className={`category-chip${category === "" ? " is-selected" : ""}`} onClick={() => setCategory("")}>Todas</button>
              {(categoriesQuery.data ?? []).map(item => (
                <button key={item} className={`category-chip${category === item ? " is-selected" : ""}`} onClick={() => setCategory(item)}>{item}</button>
              ))}
            </div>
          </div>

          {productsQuery.isLoading ? (
            <div className="state-panel"><div><ShoppingBag aria-hidden="true" /><h2>Carregando produtos</h2><p>Estamos preparando a vitrine para você.</p></div></div>
          ) : productsQuery.error ? (
            <div className="state-panel"><div><BadgeInfo aria-hidden="true" /><h2>Não foi possível carregar a vitrine</h2><p>{productsQuery.error.message}</p><button className="state-action" onClick={() => void productsQuery.refetch()}>Tentar novamente</button></div></div>
          ) : products.length === 0 ? (
            <div className="state-panel"><div><ShoppingBag aria-hidden="true" /><h2>{search || category ? "Nenhum produto encontrado" : "A vitrine está sendo preparada"}</h2><p>{search || category ? "Experimente mudar a busca ou escolher outra categoria." : "Em breve, esta seleção terá produtos com imagens, detalhes e links para comprar no Mercado Livre."}</p>{(search || category) && <button className="state-action" onClick={() => { setSearch(""); setCategory(""); }}>Limpar filtros</button>}</div></div>
          ) : (
            <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>
          )}

          <aside className="disclosure-banner">
            <BadgeInfo aria-hidden="true" />
            <span><strong>Transparência:</strong> alguns links desta vitrine são de afiliado. Podemos receber uma comissão se você comprar por eles, sem custo adicional para você. A compra é concluída no Mercado Livre.</span>
          </aside>
        </section>
      </main>

      <footer className="site-footer">
        <Brand />
        <span className="footer-disclosure">Vitrine independente. Os produtos e links são selecionados e cadastrados pelo administrador; a finalização da compra acontece no Mercado Livre.</span>
      </footer>
    </div>
  );
}
