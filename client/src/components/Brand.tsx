import { Link } from "wouter";

export default function Brand() {
  return (
    <Link href="/" className="brand-lockup" aria-label="Vitrine, página inicial">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 44 44" fill="none">
          <path d="M8 11.5c5.2-1.1 9.7-.2 14 2.9v19c-4.3-3.1-8.8-4-14-2.9v-19Z" />
          <path d="M36 11.5c-5.2-1.1-9.7-.2-14 2.9v19c4.3-3.1 8.8-4 14-2.9v-19Z" />
          <path d="M22 14.5v19" />
          <path d="m31.5 7.5 2 2 4-4" />
        </svg>
      </span>
      <span className="brand-wordmark">
        <strong>Vitrine</strong>
        <small>SELEÇÃO DE PRODUTOS</small>
      </span>
    </Link>
  );
}
