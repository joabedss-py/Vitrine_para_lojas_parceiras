import { formatMoneyBRL } from "@shared/price";
import type { RouterOutputs } from "@/lib/trpc";
import { Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";

type ChannelAnnouncement = RouterOutputs["admin"]["channelAnnouncements"][number];

type ChannelAnnouncementCardProps = {
  announcement: ChannelAnnouncement;
  isMarking: boolean;
  onMarkPublished: (productId: number) => void;
};

function formatAnnouncementDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function ChannelAnnouncementCard({ announcement, isMarking, onMarkPublished }: ChannelAnnouncementCardProps) {
  const [copyMessage, setCopyMessage] = useState("");
  const isPrepared = announcement.status === "prepared";
  const stateDate = formatAnnouncementDate(isPrepared ? announcement.preparedAt : announcement.publishedManuallyAt);

  async function copyAnnouncement() {
    setCopyMessage("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(announcement.announcementText);
      setCopyMessage("Texto copiado. Cole-o na publicação do Canal.");
    } catch {
      setCopyMessage("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <article className="channel-announcement-card">
      <div className="channel-announcement-header">
        <a className="channel-announcement-image-link" href={announcement.imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir imagem de ${announcement.title}`}>
          <img src={announcement.imageUrl} alt={`Imagem de ${announcement.title}`} loading="lazy" decoding="async" />
        </a>
        <div className="channel-announcement-product">
          <h3>{announcement.title}</h3>
          <p>{formatMoneyBRL(announcement.price)} · produto {announcement.productId}</p>
          <span className="channel-announcement-status">{isPrepared ? "Pronto para publicar" : "Publicado manualmente"}{stateDate ? ` · ${stateDate}` : ""}</span>
        </div>
      </div>

      <label className="channel-announcement-label" htmlFor={`channel-announcement-text-${announcement.productId}`}>Texto do anúncio</label>
      <textarea
        className="channel-announcement-preview"
        id={`channel-announcement-text-${announcement.productId}`}
        value={announcement.announcementText}
        readOnly
        rows={10}
        aria-label={`Texto do anúncio para ${announcement.title}`}
      />

      <div className="channel-announcement-actions">
        <button className="small-button" type="button" onClick={() => void copyAnnouncement()}>
          <Copy aria-hidden="true" /> Copiar texto
        </button>
        <a className="small-button" href={announcement.imageUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden="true" /> Abrir imagem
        </a>
        <a className="small-button" href={announcement.productUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden="true" /> Abrir página pública
        </a>
        {isPrepared && <button className="small-button" type="button" onClick={() => onMarkPublished(announcement.productId)} disabled={isMarking}>
          {isMarking ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Já publiquei — marcar como concluído
        </button>}
      </div>
      {copyMessage && <p className="form-hint" role="status">{copyMessage}</p>}
    </article>
  );
}
