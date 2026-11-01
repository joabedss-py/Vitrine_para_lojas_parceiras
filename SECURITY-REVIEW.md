# Revisão de segurança — Vitrine para lojas parceiras

**Stack confirmada:** Node.js 22, Express 4, React 19/Vite 7, tRPC 11, Drizzle ORM e MySQL.

## Cabeçalhos e CSP

O middleware em [`server/_core/security.ts`](server/_core/security.ts) envia `X-Content-Type-Options: nosniff`, HSTS com `max-age=31536000` e `Referrer-Policy`. Em produção, também envia `X-Frame-Options: DENY` e esta política:

```text
default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://d36hbw14aib5lz.cloudfront.net; font-src 'self'; connect-src 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'; manifest-src 'self'; upgrade-insecure-requests
```

A CSP e os bloqueios de iframe só são ativados com `NODE_ENV=production`. O Preview usa `NODE_ENV=development`, portanto continua embutível no painel; `X-Frame-Options` e `frame-ancestors` não são enviados nesse ambiente. A resposta pública anterior, auditada em [vitrineml-ecps2ye7.manus.space](https://vitrineml-ecps2ye7.manus.space/), já trazia HSTS (`max-age=31536000; includeSubDomains; preload`) e `nosniff` pela camada da plataforma, mas não CSP nem X-Frame-Options.

## Recursos externos e SRI

Foram removidos a importação/preconexão de Google Fonts e o helper de Google Maps que criava um `<script>` remoto dinâmico. O helper de mapas não era utilizado pelas rotas do catálogo. A injeção de analytics do site foi desativada na configuração Webdev (`analytics.enabled=false`); o badge da plataforma já estava oculto. As tags que permanecem no HTML são scripts/recursos próprios servidos no mesmo domínio. O único host externo permitido é o CloudFront exato do armazenamento de imagens, exclusivamente em `img-src`, pois `/manus-storage/` redireciona para ele; scripts, estilos, fontes e conexões permanecem same-origin. Não há dependência externa de script/stylesheet a que aplicar SRI. Se uma dependência CDN voltar a ser necessária, a integração deve incluir SHA-384 e `crossorigin="anonymous"`, ou ser empacotada localmente.

## Erros e logs

[`server/_core/trpc.ts`](server/_core/trpc.ts) devolve uma mensagem genérica para `INTERNAL_SERVER_ERROR` e remove o stack do formato tRPC. [`server/_core/errorHandling.ts`](server/_core/errorHandling.ts) trata falhas HTTP com mensagens genéricas, enquanto [`server/_core/errorLogging.ts`](server/_core/errorLogging.ts) mantém detalhes no servidor e redige tokens comuns antes de registrar o stack. Os callbacks OAuth e o proxy de storage também usam respostas neutras. O Error Boundary, as telas de catálogo e o console do cliente não mostram o objeto ou stack da exceção.

## Cookies e compatibilidade OAuth

A sessão do administrador continua com as flags `{ httpOnly: true, secure: true, sameSite: "none", path: "/" }`, definidas em [`server/_core/cookies.ts`](server/_core/cookies.ts). `SameSite=Strict` não foi usado: o Preview é HTTPS em iframe cross-site e precisa de `SameSite=None; Secure` para enviar a sessão. Os cookies temporários do Google OAuth são `HttpOnly`, `Secure` e `SameSite=Lax` para o callback de navegação do provedor. O nonce OAuth Manus é um cookie CSRF de uso curto, não um cookie de sessão; o fluxo atual o cria no navegador, portanto não é `HttpOnly`.

## Arquivos principais alterados

- [`server/_core/security.ts`](server/_core/security.ts) e [`server/_core/security.test.ts`](server/_core/security.test.ts): CSP e cabeçalhos por ambiente.
- [`server/_core/index.ts`](server/_core/index.ts), [`server/_core/errorHandling.ts`](server/_core/errorHandling.ts), [`server/_core/errorLogging.ts`](server/_core/errorLogging.ts), [`server/_core/errorHandling.test.ts`](server/_core/errorHandling.test.ts): registro do middleware, respostas e logs.
- [`server/_core/trpc.ts`](server/_core/trpc.ts), [`server/_core/oauth.ts`](server/_core/oauth.ts), [`server/_core/googleOAuth.ts`](server/_core/googleOAuth.ts), [`server/_core/storageProxy.ts`](server/_core/storageProxy.ts) e [`server/routers.ts`](server/routers.ts): sanitização das respostas/erros de serviço.
- [`client/index.html`](client/index.html), [`client/src/index.css`](client/src/index.css), [`client/src/App.tsx`](client/src/App.tsx), [`client/src/main.tsx`](client/src/main.tsx), [`client/src/components/ErrorBoundary.tsx`](client/src/components/ErrorBoundary.tsx), [`client/src/pages/Home.tsx`](client/src/pages/Home.tsx), [`client/src/pages/ProductDetailPage.tsx`](client/src/pages/ProductDetailPage.tsx) e [`client/src/pages/AdminPage.tsx`](client/src/pages/AdminPage.tsx): retirada de recursos remotos e de mensagens/estilos inline incompatíveis.

## Validação e publicação

`pnpm check` passou, os testes do projeto passaram, `pnpm build` compilou frontend e servidor e o manifesto de rotas retornou HTTP 200 no Preview. O Preview de desenvolvimento respondeu com `nosniff` e HSTS sem CSP ou X-Frame-Options, confirmando que o iframe não é bloqueado.

O estado de produção deve ser confirmado pelo status de deployment e pelo histórico de versões Webdev; um push Git isolado não é evidência suficiente de publicação. Esta nota descreve o código e as observações verificadas, não presume que um commit local ou checkpoint esteja publicado.
