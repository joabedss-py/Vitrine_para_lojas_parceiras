import Brand from "@/components/Brand";
import ChannelAnnouncementCard from "@/components/ChannelAnnouncementCard";
import { startLogin } from "@/const";
import type { RouterOutputs } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { comparePriceStrings, formatMoneyBRL, isValidPriceString, MAX_PRICE_INPUT_LENGTH, multiplyPriceStringByCount, normalizePriceString } from "@shared/price";
import { adjustSelectedLineIndent, type IndentDirection } from "@shared/text-indent";
import { inferAffiliateStoreName } from "@shared/affiliate-url";
import { ArrowLeft, ExternalLink, Image as ImageIcon, LoaderCircle, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 5 * 1024 * 1024;

type ProductForm = {
  id?: number;
  title: string;
  description: string;
  category: string;
  price: string;
  listPrice: string;
  pixPrice: string;
  cardInstallmentPrice: string;
  installments: string;
  cardInterestChoice: "unknown" | "no-interest" | "with-interest";
  storeName: string;
  shippingInfo: string;
  promotionInfo: string;
  affiliateUrl: string;
  imageUrl: string;
  isActive: boolean;
};

type AdminProduct = RouterOutputs["admin"]["list"][number];
type ChannelAnnouncement = RouterOutputs["admin"]["channelAnnouncements"][number];

const descriptionEditorFontFamilies = ["Cascadia Mono", "Consolas", "Courier New"] as const;
const descriptionEditorFontSizes = [12, 13, 14, 16] as const;
type DescriptionEditorFontFamily = typeof descriptionEditorFontFamilies[number];
type DescriptionEditorFontSize = typeof descriptionEditorFontSizes[number];
type DescriptionEditorSettings = {
  fontFamily: DescriptionEditorFontFamily;
  fontSize: DescriptionEditorFontSize;
  wordWrap: boolean;
};

const defaultDescriptionEditorSettings: DescriptionEditorSettings = {
  fontFamily: "Consolas",
  fontSize: 13,
  wordWrap: true,
};
const descriptionEditorSettingsKey = "vitrineml-description-editor-settings";

function loadDescriptionEditorSettings(): DescriptionEditorSettings {
  if (typeof window === "undefined") return defaultDescriptionEditorSettings;
  try {
    const saved = window.localStorage.getItem(descriptionEditorSettingsKey);
    if (!saved) return defaultDescriptionEditorSettings;
    const parsed = JSON.parse(saved) as Partial<DescriptionEditorSettings>;
    return {
      fontFamily: descriptionEditorFontFamilies.includes(parsed.fontFamily as DescriptionEditorFontFamily)
        ? parsed.fontFamily as DescriptionEditorFontFamily
        : defaultDescriptionEditorSettings.fontFamily,
      fontSize: descriptionEditorFontSizes.includes(parsed.fontSize as DescriptionEditorFontSize)
        ? parsed.fontSize as DescriptionEditorFontSize
        : defaultDescriptionEditorSettings.fontSize,
      wordWrap: typeof parsed.wordWrap === "boolean" ? parsed.wordWrap : defaultDescriptionEditorSettings.wordWrap,
    };
  } catch {
    return defaultDescriptionEditorSettings;
  }
}

const emptyForm: ProductForm = {
  title: "",
  description: "",
  category: "Geral",
  price: "",
  listPrice: "",
  pixPrice: "",
  cardInstallmentPrice: "",
  installments: "",
  cardInterestChoice: "unknown",
  storeName: "",
  shippingInfo: "",
  promotionInfo: "",
  affiliateUrl: "",
  imageUrl: "",
  isActive: true,
};

async function fileToBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function optimizeProductImage(file: File): Promise<{ blob: Blob; contentType: "image/jpeg" | "image/png" | "image/webp" }> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem.");
    const encodeAt = (maxDimension: number, type: "image/jpeg" | "image/png" | "image/webp", quality: number) => {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      if (type === "image/jpeg") {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error("Não foi possível otimizar a imagem.")), type, quality);
      });
    };
    const asSupportedType = (blob: Blob): "image/jpeg" | "image/png" | "image/webp" =>
      blob.type === "image/webp" || blob.type === "image/jpeg" ? blob.type : "image/png";

    const initial = await encodeAt(1600, "image/webp", 0.84);
    if (initial.size <= maxImageBytes) return { blob: initial, contentType: asSupportedType(initial) };

    const fallbackType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const dimensions = [1600, 1280, 1024, 820, 656, 525, 420];
    const qualities = [0.82, 0.78, 0.74, 0.70, 0.66, 0.62, 0.58];
    for (let index = 0; index < dimensions.length; index++) {
      const type = initial.type === "image/webp" ? "image/webp" : fallbackType;
      const blob = await encodeAt(dimensions[index], type, qualities[index]);
      if (blob.size <= maxImageBytes) return { blob, contentType: asSupportedType(blob) };
    }
    throw new Error("A imagem otimizada ainda excede 5 MB. Tente uma foto com resolução menor.");
  } finally {
    bitmap.close();
  }
}

export default function AdminPage() {
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const providers = trpc.auth.providers.useQuery();
  const logout = trpc.auth.logout.useMutation();
  const products = trpc.admin.list.useQuery(undefined, { enabled: auth.data?.isAdmin === true });
  const channelAnnouncements = trpc.admin.channelAnnouncements.useQuery(undefined, { enabled: auth.data?.isAdmin === true });
  const markChannelAnnouncementPublished = trpc.admin.markChannelAnnouncementPublished.useMutation();
  const utils = trpc.useUtils();
  const uploadImage = trpc.admin.uploadImage.useMutation();
  const create = trpc.admin.create.useMutation();
  const update = trpc.admin.update.useMutation();
  const remove = trpc.admin.delete.useMutation();
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isOptimizingImage, setIsOptimizingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [channelAnnouncementMessage, setChannelAnnouncementMessage] = useState("");
  const [loginError, setLoginError] = useState("");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [descriptionEditorSettings, setDescriptionEditorSettings] = useState(loadDescriptionEditorSettings);
  const [descriptionCursor, setDescriptionCursor] = useState({ line: 1, column: 1 });

  useEffect(() => {
    if (imagePreview.startsWith("blob:")) return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  useEffect(() => {
    try {
      window.localStorage.setItem(descriptionEditorSettingsKey, JSON.stringify(descriptionEditorSettings));
    } catch {
      // Editor preferences are optional; continue working when browser storage is unavailable.
    }
  }, [descriptionEditorSettings]);

  useEffect(() => {
    const googleStatus = new URLSearchParams(window.location.search).get("google");
    if (googleStatus === "error") setLoginError("Não foi possível concluir o login com Google. Tente novamente.");
    else if (googleStatus === "cancelled") setLoginError("O login com Google foi cancelado.");
    else if (googleStatus === "unavailable") setLoginError("O login com Google ainda não está configurado neste ambiente.");
    else if (googleStatus === "unauthorized") setLoginError("Entre com o e-mail Google autorizado para administrar esta vitrine.");
  }, []);

  const isSaving = isOptimizingImage || uploadImage.isPending || create.isPending || update.isPending;
  const isAuthorized = auth.data?.isAdmin === true;
  const inferredAffiliateStore = inferAffiliateStoreName(form.affiliateUrl);
  const affiliateDestinationHint = form.affiliateUrl
    ? `${inferredAffiliateStore ? `Plataforma reconhecida: ${inferredAffiliateStore}. ` : "Loja parceira HTTPS. "}Este link, incluindo os parâmetros de afiliado, será o destino exato do botão “Compre aqui”.`
    : "Aceita links HTTPS da Shopee, Mercado Livre e outras lojas. O destino informado será preservado no botão “Compre aqui”.";
  const installmentCount = Number(form.installments);
  const normalizedInstallmentPrice = form.cardInstallmentPrice.trim() && isValidPriceString(form.cardInstallmentPrice)
    ? normalizePriceString(form.cardInstallmentPrice)
    : null;
  const cardCalculation = normalizedInstallmentPrice && Number.isInteger(installmentCount) && installmentCount >= 1 && installmentCount <= 48
    ? {
        installmentCount,
        installmentPrice: normalizedInstallmentPrice,
        total: multiplyPriceStringByCount(normalizedInstallmentPrice, installmentCount),
      }
    : null;

  async function markChannelAnnouncementAsPublished(productId: number) {
    setChannelAnnouncementMessage("");
    try {
      await markChannelAnnouncementPublished.mutateAsync({ productId });
      await channelAnnouncements.refetch();
      setChannelAnnouncementMessage("Publicação manual registrada.");
    } catch {
      setChannelAnnouncementMessage("Não foi possível registrar a publicação. Verifique se o produto ainda está ativo.");
    }
  }

  async function refreshCatalog() {
    await Promise.all([
      utils.admin.list.invalidate(),
      utils.products.list.invalidate(),
      utils.products.categories.invalidate(),
      utils.admin.channelAnnouncements.invalidate(),
    ]);
  }

  function beginEdit(product: AdminProduct) {
    setForm({
      id: product.id,
      title: product.title,
      description: product.description,
      category: product.category,
      price: String(product.price),
      listPrice: product.listPrice ?? "",
      pixPrice: product.pixPrice ?? "",
      cardInstallmentPrice: product.cardInstallmentPrice ?? "",
      installments: product.installments === null ? "" : String(product.installments),
      cardInterestChoice: product.cardInterestFree === null ? "unknown" : product.cardInterestFree ? "no-interest" : "with-interest",
      storeName: product.storeName ?? "",
      shippingInfo: product.shippingInfo ?? "",
      promotionInfo: product.promotionInfo ?? "",
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
    setDescriptionCursor({ line: 1, column: 1 });
  }

  function updateDescriptionCursor(textarea = descriptionRef.current) {
    if (!textarea) return;
    const beforeCursor = textarea.value.slice(0, textarea.selectionStart);
    const lastLineBreak = beforeCursor.lastIndexOf("\n");
    setDescriptionCursor({
      line: beforeCursor.split("\n").length,
      column: beforeCursor.length - lastLineBreak,
    });
  }

  function changeDescriptionIndent(direction: IndentDirection) {
    const textarea = descriptionRef.current;
    if (!textarea) return;

    const adjusted = adjustSelectedLineIndent(
      form.description,
      textarea.selectionStart,
      textarea.selectionEnd,
      direction,
    );
    if (adjusted.value.length > 6000) {
      setFormError("A descrição não pode ultrapassar 6.000 caracteres.");
      return;
    }

    setForm(current => ({ ...current, description: adjusted.value }));
    setFormError("");
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(adjusted.selectionStart, adjusted.selectionEnd);
      updateDescriptionCursor(textarea);
    });
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
    const rawPrice = form.price.trim();
    if (!isValidPriceString(rawPrice)) {
      setFormError("Informe um preço positivo com até 63 dígitos e duas casas decimais.");
      return;
    }
    for (const [label, value] of [
      ["o preço original", form.listPrice],
      ["o preço no Pix", form.pixPrice],
      ["o valor por parcela no cartão", form.cardInstallmentPrice],
    ] as const) {
      if (value.trim() && !isValidPriceString(value)) {
        setFormError(`Informe ${label} como valor positivo, com até 63 dígitos e duas casas decimais.`);
        return;
      }
    }
    const price = normalizePriceString(rawPrice);
    const normalizeOptionalPrice = (value: string) => value.trim() ? normalizePriceString(value) : null;
    const listPrice = normalizeOptionalPrice(form.listPrice);
    const pixPrice = normalizeOptionalPrice(form.pixPrice);
    const cardInstallmentPrice = normalizeOptionalPrice(form.cardInstallmentPrice);
    if (listPrice && comparePriceStrings(listPrice, price) <= 0) {
      setFormError("O preço original deve ser maior que o preço à vista para mostrar um desconto.");
      return;
    }
    const rawInstallments = form.installments.trim();
    const installments = rawInstallments ? Number(rawInstallments) : null;
    if (Boolean(cardInstallmentPrice) !== (installments !== null)) {
      setFormError("Informe juntos o valor por parcela no cartão e a quantidade de parcelas.");
      return;
    }
    if (installments !== null && (!Number.isInteger(installments) || installments < 1 || installments > 48)) {
      setFormError("A quantidade de parcelas deve ficar entre 1 e 48.");
      return;
    }
    if (!cardInstallmentPrice && form.cardInterestChoice !== "unknown") {
      setFormError("Informe a condição de juros somente quando cadastrar as parcelas do cartão.");
      return;
    }
      const cardInterestFree = form.cardInterestChoice === "unknown" ? null : form.cardInterestChoice === "no-interest";
    let successNotice = "";
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) {
        setIsOptimizingImage(true);
        let optimized: Awaited<ReturnType<typeof optimizeProductImage>>;
        try {
          optimized = await optimizeProductImage(imageFile);
        } finally {
          setIsOptimizingImage(false);
        }
        const base64 = await fileToBase64(optimized.blob);
        const uploaded = await uploadImage.mutateAsync({ contentType: optimized.contentType, base64 });
        imageUrl = uploaded.url;
      }
      const fields = {
        title: form.title.trim(),
        description: form.description.trimEnd(),
        category: form.category.trim() || "Geral",
        price,
        listPrice,
        pixPrice,
        cardInstallmentPrice,
        installments,
        cardInterestFree,
        storeName: form.storeName.trim() || null,
        shippingInfo: form.shippingInfo.trim() || null,
        promotionInfo: form.promotionInfo.trim() || null,
        imageUrl,
        affiliateUrl: form.affiliateUrl.trim(),
        isActive: form.isActive,
      };
      if (form.id) {
        await update.mutateAsync({ id: form.id, ...fields } as Parameters<typeof update.mutateAsync>[0]);
        successNotice = "Produto atualizado.";
      } else {
        const created = await create.mutateAsync(fields as Parameters<typeof create.mutateAsync>[0]);
        successNotice = created.announcementStatus === "prepared"
          ? "Produto cadastrado; o anúncio está pronto para revisar e publicar manualmente no Canal."
          : "Produto cadastrado como oculto; nenhum anúncio foi preparado.";
      }
      await refreshCatalog();
      resetForm();
      setNotice(successNotice);
    } catch {
      setFormError("Não foi possível salvar o produto. Tente novamente.");
    }
  }

  async function deleteProduct(product: AdminProduct) {
    if (!window.confirm(`Remover “${product.title}” da vitrine?`)) return;
    try {
      await remove.mutateAsync({ id: product.id });
      await refreshCatalog();
      if (form.id === product.id) resetForm();
      setNotice("Produto removido da vitrine.");
      setFormError("");
    } catch {
      setFormError("Não foi possível remover o produto. Tente novamente.");
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
              <button className="state-action" onClick={() => { try { startLogin(); } catch { setLoginError("Não foi possível iniciar o login. Tente novamente."); } }}>
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
        <div className="admin-top-actions"><span>Cadastro</span><Link className="back-link" href="/admin/monitoramento">Monitoramento</Link><button className="text-button" onClick={() => void logout.mutateAsync()}><LogOut size={14} aria-hidden="true" /> Sair</button><Link className="back-link" href="/"><ArrowLeft aria-hidden="true" /> Vitrine</Link></div>
      </header>
      <main>
        <section className="admin-heading">
          <p className="kicker">Área restrita</p>
          <h1>Gerencie sua seleção.</h1>
          <p>Cadastre produtos de qualquer loja. Para links da Shopee, Mercado Livre ou outro e-commerce, informe o destino afiliado exato; a configuração de monitoramento fica em uma página separada.</p>
        </section>

        <section className="admin-panel monitor-status-panel" aria-labelledby="channel-announcements-title">
          <div className="monitor-panel-heading">
            <div><h2 id="channel-announcements-title">Anúncios para publicar manualmente no Canal</h2><p>A Vitrine prepara o texto dos produtos ativos. Nada é enviado automaticamente ao WhatsApp; revise o anúncio e publique pelo aplicativo do Canal.</p></div>
            <span className="monitor-environment">Preparação manual</span>
          </div>
          {channelAnnouncements.isLoading ? <p className="form-hint">Carregando anúncios preparados…</p> : channelAnnouncements.error ? <p className="form-error" role="status">Não foi possível carregar os anúncios preparados.<br /><button className="text-button" type="button" onClick={() => void channelAnnouncements.refetch()}>Tentar novamente</button></p> : channelAnnouncements.data?.length ? (
            <div className="channel-announcement-list">
              {channelAnnouncements.data.map(announcement => <ChannelAnnouncementCard key={announcement.productId} announcement={announcement} isMarking={markChannelAnnouncementPublished.isPending} onMarkPublished={markChannelAnnouncementAsPublished} />)}
            </div>
          ) : <div className="admin-empty"><ImageIcon aria-hidden="true" /><br />Nenhum anúncio preparado.<br />Cadastre ou ative um produto para preparar uma publicação.</div>}
          {channelAnnouncementMessage && <p className="form-hint monitor-message" role="status">{channelAnnouncementMessage}</p>}
        </section>

        <div className="admin-columns">
          <section className="admin-panel" aria-labelledby="form-title">
            <h2 id="form-title">{form.id ? "Editar produto" : "Adicionar produto"}</h2>
            <form className="admin-form" onSubmit={submitForm}>
              <div className="form-field"><label htmlFor="product-title">Título do produto</label><input id="product-title" required maxLength={180} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Fone sem fio Bluetooth" /></div>
              <div className="form-field">
                <label htmlFor="product-description">Descrição e detalhes</label>
                <div className="description-editor">
                  <div className="description-editor-toolbar" role="toolbar" aria-label="Configurações do editor de descrição">
                    <div className="description-editor-setting">
                      <label htmlFor="description-editor-font">Fonte</label>
                      <select id="description-editor-font" className="description-editor-control" value={descriptionEditorSettings.fontFamily} onChange={event => setDescriptionEditorSettings(current => ({ ...current, fontFamily: event.target.value as DescriptionEditorFontFamily }))}>
                        <option value="Cascadia Mono">Cascadia Mono</option>
                        <option value="Consolas">Consolas</option>
                        <option value="Courier New">Courier New</option>
                      </select>
                    </div>
                    <div className="description-editor-setting">
                      <label htmlFor="description-editor-size">Tamanho</label>
                      <select id="description-editor-size" className="description-editor-control" value={descriptionEditorSettings.fontSize} onChange={event => setDescriptionEditorSettings(current => ({ ...current, fontSize: Number(event.target.value) as DescriptionEditorFontSize }))}>
                        {descriptionEditorFontSizes.map(size => <option key={size} value={size}>{size} px</option>)}
                      </select>
                    </div>
                    <label className="description-editor-wrap"><input type="checkbox" checked={descriptionEditorSettings.wordWrap} onChange={event => setDescriptionEditorSettings(current => ({ ...current, wordWrap: event.target.checked }))} /> Quebra automática</label>
                  </div>
                  <div className="description-indent-tools" role="group" aria-label="Indentação da descrição">
                    <button className="small-button" type="button" onClick={() => changeDescriptionIndent("indent")}>Recuar linhas</button>
                    <button className="small-button" type="button" onClick={() => changeDescriptionIndent("outdent")}>Remover recuo</button>
                    <span className="form-hint">Aplique às linhas selecionadas; cada recuo usa 2 espaços.</span>
                  </div>
                  <textarea
                    ref={descriptionRef}
                    className={`description-notepad-textarea ${descriptionEditorSettings.fontFamily === "Cascadia Mono" ? "font-cascadia" : descriptionEditorSettings.fontFamily === "Consolas" ? "font-consolas" : "font-courier"} text-size-${descriptionEditorSettings.fontSize}${descriptionEditorSettings.wordWrap ? " wrapped" : " no-wrap"}`}
                    id="product-description"
                    required
                    maxLength={6000}
                    value={form.description}
                    wrap={descriptionEditorSettings.wordWrap ? "soft" : "off"}
                    onChange={event => {
                      setForm(current => ({ ...current, description: event.target.value }));
                      updateDescriptionCursor(event.currentTarget);
                    }}
                    onSelect={event => updateDescriptionCursor(event.currentTarget)}
                    onKeyUp={event => updateDescriptionCursor(event.currentTarget)}
                    onClick={event => updateDescriptionCursor(event.currentTarget)}
                    placeholder="Conte o que vale a pena saber sobre este produto."
                    aria-describedby="description-editor-status"
                  />
                  <div className="description-editor-statusbar" id="description-editor-status" role="status" aria-live="polite">
                    <span>Linha {descriptionCursor.line}, coluna {descriptionCursor.column}</span>
                    <span>{form.description.length} / 6.000 caracteres</span>
                  </div>
                </div>
              </div>
              <div className="form-field"><label htmlFor="product-category">Categoria</label><input id="product-category" required maxLength={80} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="Ex.: Casa, tecnologia, beleza" /></div>
              <div className="form-field"><label htmlFor="product-store">Loja/vendedor (opcional)</label><input id="product-store" maxLength={120} value={form.storeName} onChange={event => setForm({ ...form, storeName: event.target.value })} placeholder="Ex.: Shopee, Amazon, outra loja" /></div>
              <section className="pricing-form-section" aria-labelledby="pricing-form-title">
                <div className="pricing-form-title"><h3 id="pricing-form-title">Preços e condições</h3><p>Apenas o preço à vista é obrigatório; Pix, cartão, preço original e observações são opcionais. Aceita formatos como 9.699,00 ou 9,699.00, com vírgula ou ponto e separador de milhar.</p></div>
                <div className="pricing-form-grid">
                  <div className="form-field"><label htmlFor="product-price">Preço à vista (R$)</label><input id="product-price" type="text" inputMode="decimal" maxLength={MAX_PRICE_INPUT_LENGTH} required value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} placeholder="9.699,00" /></div>
                  <div className="form-field"><label htmlFor="product-list-price">Preço original (opcional)</label><input id="product-list-price" type="text" inputMode="decimal" maxLength={MAX_PRICE_INPUT_LENGTH} value={form.listPrice} onChange={event => setForm({ ...form, listPrice: event.target.value })} placeholder="11.639,00" /><span className="form-hint">Deve ser maior que o preço à vista; o desconto será calculado.</span></div>
                  <div className="form-field"><label htmlFor="product-pix-price">Preço no Pix (opcional, R$)</label><input id="product-pix-price" type="text" inputMode="decimal" maxLength={MAX_PRICE_INPUT_LENGTH} value={form.pixPrice} onChange={event => setForm({ ...form, pixPrice: event.target.value })} placeholder="9.399,00" /></div>
                  <div className="form-field"><label htmlFor="product-card-price">Valor por parcela no cartão (R$)</label><input id="product-card-price" type="text" inputMode="decimal" maxLength={MAX_PRICE_INPUT_LENGTH} value={form.cardInstallmentPrice} onChange={event => setForm({ ...form, cardInstallmentPrice: event.target.value })} placeholder="969,90" /></div>
                  <div className="form-field"><label htmlFor="product-installments">Quantidade de parcelas</label><input id="product-installments" type="number" min={1} max={48} step={1} value={form.installments} onChange={event => setForm({ ...form, installments: event.target.value })} placeholder="10" /></div>
                  <div className="form-field"><label htmlFor="product-card-interest">Juros no cartão</label><select id="product-card-interest" value={form.cardInterestChoice} onChange={event => setForm({ ...form, cardInterestChoice: event.target.value as ProductForm["cardInterestChoice"] })}><option value="unknown">Não informado</option><option value="no-interest">Sem juros</option><option value="with-interest">Com juros</option></select></div>
                  <div className="form-field"><label htmlFor="product-shipping">Frete/entrega (opcional)</label><input id="product-shipping" maxLength={180} value={form.shippingInfo} onChange={event => setForm({ ...form, shippingInfo: event.target.value })} placeholder="Ex.: Frete grátis na primeira compra" /></div>
                  <div className="form-field"><label htmlFor="product-promotion">Observação de promoção (opcional)</label><input id="product-promotion" maxLength={180} value={form.promotionInfo} onChange={event => setForm({ ...form, promotionInfo: event.target.value })} placeholder="Ex.: Oferta válida até domingo" /></div>
                </div>
                {cardCalculation && <p className="card-calculation-preview" role="status" aria-live="polite">Total no cartão: {cardCalculation.installmentCount} × {formatMoneyBRL(cardCalculation.installmentPrice)} = <strong>{formatMoneyBRL(cardCalculation.total)}</strong></p>}
                <span className="form-hint">O total no cartão será calculado pelo valor de cada parcela multiplicado pela quantidade informada.</span>
              </section>
              <div className="form-field"><label htmlFor="affiliate-link">Link de afiliado da loja</label><input id="affiliate-link" type="url" pattern="https://.*" required maxLength={2048} value={form.affiliateUrl} onChange={event => setForm({ ...form, affiliateUrl: event.target.value })} placeholder="Cole o link HTTPS da Shopee ou de outra loja parceira" /><span className="form-hint">{affiliateDestinationHint}</span></div>
              <div className="form-field"><label htmlFor="product-image">Imagem do produto</label><input id="product-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => chooseImage(event.target.files?.[0])} /><span className="form-hint">JPG, PNG ou WebP, até 5 MB; a imagem será otimizada antes do envio.</span>{imagePreview && <div className="admin-thumb"><img src={imagePreview} alt="Prévia do produto" decoding="async" /></div>}</div>
              <label className="form-checkbox"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} /> Exibir este produto na vitrine pública</label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              {notice && <p className="form-success" role="status">{notice}</p>}
              <div className="form-actions"><button className="buy-button form-submit" type="submit" disabled={isSaving}>{isSaving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}{isOptimizingImage ? "Otimizando imagem..." : isSaving ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar produto"}</button>{form.id && <button className="small-button" type="button" onClick={resetForm}>Cancelar</button>}</div>
            </form>
          </section>

          <section className="admin-panel" aria-labelledby="products-title">
            <h2 id="products-title">Produtos cadastrados {products.data ? `(${products.data.length})` : ""}</h2>
            {products.isLoading ? <div className="admin-empty">Carregando catálogo…</div> : products.error ? <div className="admin-empty">Não foi possível carregar o catálogo.<br /><button className="text-button" onClick={() => void products.refetch()}>Tentar novamente</button></div> : products.data?.length ? (
              <div className="product-admin-list">{products.data.map(product => <AdminProductRow key={product.id} product={product} onEdit={beginEdit} onDelete={deleteProduct} />)}</div>
            ) : <div className="admin-empty"><ImageIcon aria-hidden="true" /><br />Nenhum produto cadastrado ainda.<br />Use o formulário para adicionar o primeiro.</div>}
          </section>
        </div>
      </main>
    </div>
  );
}

function AdminProductRow({ product, onEdit, onDelete }: { product: AdminProduct; onEdit: (product: AdminProduct) => void; onDelete: (product: AdminProduct) => void }) {
  return (
    <article className="admin-product-row">
      <div className="admin-thumb"><img src={product.imageUrl} alt="" loading="lazy" decoding="async" /></div>
      <div>
        <div className="admin-row-title" title={product.title}>{product.title}</div>
        <div className="admin-row-meta">{product.category} · {formatMoneyBRL(product.price)}</div>
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
