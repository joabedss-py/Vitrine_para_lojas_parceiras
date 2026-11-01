import Brand from "@/components/Brand";
import { startLogin } from "@/const";
import type { CatalogProduct } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ExternalLink, Image as ImageIcon, LoaderCircle, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 5 * 1024 * 1024;

type ProductForm = {
  id?: number;
  title: string;
  description: string;
  category: string;
  price: string;
  affiliateUrl: string;
  imageUrl: string;
  isActive: boolean;
};

const emptyForm: ProductForm = {
  title: "",
  description: "",
  category: "Geral",
  price: "",
  affiliateUrl: "",
  imageUrl: "",
  isActive: true,
};

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export default function AdminPage() {
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const providers = trpc.auth.providers.useQuery();
  const logout = trpc.auth.logout.useMutation();
  const products = trpc.admin.list.useQuery(undefined, { enabled: auth.data?.role === "admin" });
  const utils = trpc.useUtils();
  const uploadImage = trpc.admin.uploadImage.useMutation();
  const create = trpc.admin.create.useMutation();
  const update = trpc.admin.update.useMutation();
  const remove = trpc.admin.delete.useMutation();
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (imagePreview.startsWith("blob:")) return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  useEffect(() => {
    const googleStatus = new URLSearchParams(window.location.search).get("google");
    if (googleStatus === "error") setLoginError("Não foi possível concluir o login com Google. Tente novamente.");
    else if (googleStatus === "cancelled") setLoginError("O login com Google foi cancelado.");
    else if (googleStatus === "unavailable") setLoginError("O login com Google ainda não está configurado neste ambiente.");
    else if (googleStatus === "unauthorized") setLoginError("Entre com o e-mail Google autorizado para administrar esta vitrine.");
  }, []);

  const isSaving = uploadImage.isPending || create.isPending || update.isPending;
  const isAuthorized = auth.data?.role === "admin";

  async function refreshCatalog() {
    await Promise.all([
      utils.admin.list.invalidate(),
      utils.products.list.invalidate(),
      utils.products.categories.invalidate(),
    ]);
  }

  function beginEdit(product: CatalogProduct) {
    setForm({
      id: product.id,
      title: product.title,
      description: product.description,
      category: product.category,
      price: String(product.price),
      affiliateUrl: product.affiliateUrl,
      imageUrl: product.imageUrl,
      isActive: product.isActive,
    });
    setImageFile(null);
    setImagePreview(product.imageUrl);
    setFormError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview("");
    setFormError("");
    setNotice("");
  }

  function chooseImage(file?: File) {
    if (!file) return;
    setFormError("");
    if (!allowedImageTypes.includes(file.type)) {
      setFormError("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > maxImageBytes) {
      setFormError("A imagem deve ter até 5 MB.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    if (!form.imageUrl && !imageFile) {
      setFormError("Adicione uma imagem do produto antes de salvar.");
      return;
    }
    const price = Number(form.price.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) {
      setFormError("Informe um preço válido, maior que zero.");
      return;
    }
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) {
        const base64 = await fileToBase64(imageFile);
        const uploaded = await uploadImage.mutateAsync({ contentType: imageFile.type as "image/jpeg" | "image/png" | "image/webp", base64 });
        imageUrl = uploaded.url;
      }
      const fields = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim() || "Geral",
        price,
        imageUrl,
        affiliateUrl: form.affiliateUrl.trim(),
        isActive: form.isActive,
      };
      if (form.id) {
        await update.mutateAsync({ id: form.id, ...fields });
        setNotice("Produto atualizado.");
      } else {
        await create.mutateAsync(fields);
        setNotice("Produto cadastrado.");
      }
      await refreshCatalog();
      resetForm();
      setNotice(form.id ? "Produto atualizado." : "Produto cadastrado.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    }
  }

  async function deleteProduct(product: CatalogProduct) {
    if (!window.confirm(`Remover “${product.title}” da vitrine?`)) return;
    try {
      await remove.mutateAsync({ id: product.id });
      await refreshCatalog();
      if (form.id === product.id) resetForm();
      setNotice("Produto removido da vitrine.");
      setFormError("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível remover o produto.");
    }
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
            <h2>Entre para administrar a vitrine</h2>
            <p>Entre com a conta Google autorizada ou, como alternativa, com sua conta Manus para cadastrar, editar ou remover produtos e seus links de afiliado.</p>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            <div className="login-options">
              {providers.data?.google && (
                <a className="state-action google-action" href="/api/oauth/google/start">
                  <span className="google-mark" aria-hidden="true">G</span>
                  Entrar com Google
                </a>
              )}
              <button className="state-action" onClick={() => { try { startLogin(); } catch (error) { setLoginError(error instanceof Error ? error.message : "Não foi possível iniciar o login."); } }}>
                Entrar com Manus
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="site-shell">
        <header className="admin-top"><Brand /><Link className="back-link" href="/"><ArrowLeft aria-hidden="true" /> Voltar à vitrine</Link></header>
        <main className="state-panel"><div><LogOut aria-hidden="true" /><h2>Acesso não autorizado</h2><p>Esta conta não está configurada como administradora desta vitrine.</p><button className="state-action" onClick={() => void logout.mutateAsync()}>Sair desta conta</button></div></main>
      </div>
    );
  }

  return (
    <div className="site-shell admin-shell">
      <header className="admin-top">
        <Brand />
        <div className="admin-top-actions"><span>Administração</span><button className="text-button" onClick={() => void logout.mutateAsync()}><LogOut size={14} aria-hidden="true" /> Sair</button><Link className="back-link" href="/"><ArrowLeft aria-hidden="true" /> Vitrine</Link></div>
      </header>
      <main>
        <section className="admin-heading">
          <p className="kicker">Área restrita</p>
          <h1>Gerencie sua seleção.</h1>
          <p>Cadastre os detalhes do produto e o link que será usado no botão “Compre aqui”.</p>
        </section>

        <div className="admin-columns">
          <section className="admin-panel" aria-labelledby="form-title">
            <h2 id="form-title">{form.id ? "Editar produto" : "Adicionar produto"}</h2>
            <form className="admin-form" onSubmit={submitForm}>
              <div className="form-field"><label htmlFor="product-title">Título do produto</label><input id="product-title" required maxLength={180} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Fone sem fio Bluetooth" /></div>
              <div className="form-field"><label htmlFor="product-description">Descrição e detalhes</label><textarea id="product-description" required maxLength={6000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Conte o que vale a pena saber sobre este produto." /></div>
              <div className="form-field"><label htmlFor="product-category">Categoria</label><input id="product-category" required maxLength={80} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="Ex.: Casa, tecnologia, beleza" /></div>
              <div className="form-field"><label htmlFor="product-price">Preço (R$)</label><input id="product-price" type="number" min="0.01" step="0.01" required value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} placeholder="199,90" /></div>
              <div className="form-field"><label htmlFor="affiliate-link">Link de afiliado do Mercado Livre</label><input id="affiliate-link" type="url" required value={form.affiliateUrl} onChange={event => setForm({ ...form, affiliateUrl: event.target.value })} placeholder="https://www.mercadolivre.com.br/..." /><span className="form-hint">Aceitamos links HTTPS do Mercado Livre e links curtos meli.la.</span></div>
              <div className="form-field"><label htmlFor="product-image">Imagem do produto</label><input id="product-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => chooseImage(event.target.files?.[0])} /><span className="form-hint">JPG, PNG ou WebP, até 5 MB. O arquivo ficará em armazenamento durável.</span>{imagePreview && <div className="admin-thumb"><img src={imagePreview} alt="Prévia do produto" /></div>}</div>
              <label className="form-checkbox"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Exibir este produto na vitrine pública</label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              {notice && <p className="form-success" role="status">{notice}</p>}
              <div className="form-actions"><button className="buy-button form-submit" type="submit" disabled={isSaving}>{isSaving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}{isSaving ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar produto"}</button>{form.id && <button className="small-button" type="button" onClick={resetForm}>Cancelar</button>}</div>
            </form>
          </section>

          <section className="admin-panel" aria-labelledby="products-title">
            <h2 id="products-title">Produtos cadastrados {products.data ? `(${products.data.length})` : ""}</h2>
            {products.isLoading ? <div className="admin-empty">Carregando catálogo…</div> : products.error ? <div className="admin-empty">{products.error.message}<br /><button className="text-button" onClick={() => void products.refetch()}>Tentar novamente</button></div> : products.data?.length ? (
              <div className="product-admin-list">{products.data.map(product => <AdminProductRow key={product.id} product={product} onEdit={beginEdit} onDelete={deleteProduct} />)}</div>
            ) : <div className="admin-empty"><ImageIcon aria-hidden="true" /><br />Nenhum produto cadastrado ainda.<br />Use o formulário para adicionar o primeiro.</div>}
          </section>
        </div>
      </main>
    </div>
  );
}

function AdminProductRow({ product, onEdit, onDelete }: { product: CatalogProduct; onEdit: (product: CatalogProduct) => void; onDelete: (product: CatalogProduct) => void }) {
  return (
    <article className="admin-product-row">
      <div className="admin-thumb"><img src={product.imageUrl} alt="" /></div>
      <div>
        <div className="admin-row-title" title={product.title}>{product.title}</div>
        <div className="admin-row-meta">{product.category} · {money.format(Number(product.price))}</div>
        <span className={`admin-row-status${product.isActive ? "" : " is-hidden"}`}>{product.isActive ? "Visível na vitrine" : "Oculto"}</span>
      </div>
      <div className="admin-row-actions">
        <button className="small-button" type="button" onClick={() => onEdit(product)} aria-label={`Editar ${product.title}`}><Pencil aria-hidden="true" /> Editar</button>
        <a className="small-button" href={product.affiliateUrl} target="_blank" rel="nofollow sponsored noopener noreferrer" aria-label={`Abrir link de afiliado de ${product.title}`}><ExternalLink aria-hidden="true" /></a>
        <button className="small-button danger" type="button" onClick={() => onDelete(product)} aria-label={`Remover ${product.title}`}><Trash2 aria-hidden="true" /></button>
      </div>
    </article>
  );
}
