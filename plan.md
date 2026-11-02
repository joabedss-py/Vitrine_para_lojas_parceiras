# Plano: monitoramento de preço e disponibilidade de produtos

## Objetivo e decisões

Adicionar ao catálogo uma opção de monitoramento automático de preço e disponibilidade, começando pelo Mercado Livre e usando uma arquitetura de adaptadores por loja. Cada loja futura exigirá um adaptador explícito para a sua API ou feed oficial; o sistema não tentará raspar páginas arbitrárias.

O URL de afiliado existente continua sendo o destino exato do botão “Compre aqui”. O monitor terá um URL canônico/ID de produto separado, validado por adaptador e usado somente no servidor. Para Mercado Livre será usado OAuth 2.0 de leitura (`read` e `offline_access`) e a API oficial. O acesso exige credenciais de uma aplicação de desenvolvedor e autorização da conta Mercado Livre; segredos não serão colocados no navegador, no código ou no Git. Access/refresh tokens ficam cifrados com AES-256-GCM; refresh tokens, que são rotativos e de uso único, serão substituídos atomicamente.

O administrador pode ativar/desativar o monitor por produto, consultar o último resultado e solicitar uma verificação manual. O Heartbeat do Webdev acorda a cada 15 minutos e reivindica o job com um lease para impedir callbacks duplicados; cada produto confirmado só volta a ser consultado após seis horas. As falhas recebem backoff exponencial, respeitam `Retry-After` e pausam a automação daquele produto após oito tentativas até correção/reconexão; erros técnicos não mudam preço nem marcam o item como esgotado.

O preço oficial da listagem atualizará o preço à vista da Vitrine; preço original só será sincronizado quando o adaptador o fornecer. O endpoint Mercado Livre não é fonte confiável de parcelas ou preço Pix, então essas condições ficam manuais e devem ser identificadas como não verificadas automaticamente. A disponibilidade confirmada como zero/anúncio indisponível deixa o produto visível com selo “Indisponível” e desativa “Compre aqui”; o administrador ainda pode ocultá-lo manualmente. A quantidade pública do Mercado Livre pode vir em faixas, portanto a interface não afirmará uma contagem exata. Se a última consulta bem-sucedida tiver mais de 24 horas (ou não existir), mostrar “Disponibilidade não confirmada” e manter o link clicável para o visitante confirmar na loja; só desativar o botão diante de indisponibilidade confirmada em consulta recente.

## Implementação e estrutura

- `drizzle/schema.ts` e uma migração aditiva armazenam provedor/URL/ID de origem, ativação do monitor, disponibilidade, instante da última verificação e diagnóstico resumido. Uma tabela de conexão de marketplace guarda a conta conectada e refresh token cifrado; um histórico de alterações de preço preserva valor anterior, novo valor e horário.
- `server/marketplaces/` define a interface `MarketplaceProvider`, o registro de adaptadores e a primeira implementação do Mercado Livre. O adaptador valida origem/domínio e ID canônico, chama somente `api.mercadolibre.com`, valida item `MLB`/BRL e transforma a resposta em um snapshot normalizado. O adaptador seguinte poderá ser adicionado sem reescrever o scheduler nem as páginas públicas.
- `server/_core/marketplaceOAuth.ts` implementa o callback OAuth com `state`, redirects fixos e cookie `__Host-` HttpOnly/Secure/Lax. `server/marketplaces/mercadoLivreOAuth.ts` gerencia o escopo mínimo de leitura e rotação de tokens; `tokenVault.ts` cifra tokens. As credenciais são obtidas pelo mecanismo protegido de Secrets do Webdev.
- `server/productMonitor.ts`, `server/db.ts` e `server/routers.ts` coordenam consulta manual e agendada, controle de falhas/backoff, histórico, procedimentos somente administrativos e saída pública do estado verificado. `server/_core/index.ts` registra o callback Heartbeat autenticado conforme o contrato Webdev.
- `client/src/pages/AdminPage.tsx` adiciona seleção do adaptador Mercado Livre, URL canônico, chave liga/desliga, conexão OAuth da conta e estado/ação de sincronização. `client/src/pages/Home.tsx`, `ProductDetailPage.tsx` e `ProductPricing.tsx` apresentam disponibilidade sem expor detalhes internos; CSS reaproveita a identidade e os componentes existentes.

## Dados e compatibilidade

A migração é exclusivamente aditiva; produtos atuais continuam sem monitor e mantêm todos os valores e links. `isActive` continua representando visibilidade escolhida pelo administrador e não será alterado automaticamente por erro de consulta. A URL de afiliado não é resolvida/visitada pelo servidor, evitando SSRF e preservando seu tracking. Só se aceita uma URL/ID oficial compatível com o adaptador; para um novo e-commerce sem adaptador, o cadastro continua manual até essa integração ser adicionada. O histórico de preços de um produto é removido na mesma transação quando o administrador exclui esse produto.

A callback da aplicação Mercado Livre usa `https://vitrineml-ecps2ye7.manus.space/api/oauth/mercadolivre/callback`. Em produção, o administrador inicia a conexão e habilita o job; o ambiente Preview não tenta criar tarefas de produção.

O banco Webdev é compartilhado entre desenvolvimento e produção; a migração precisa preservar os registros existentes. Testes devem mockar as respostas HTTP do marketplace e não gravar dados reais no banco compartilhado.

## WhatsApp Groups API — anúncios de produto novo

A integração usa exclusivamente a WhatsApp Cloud API/Groups API oficial. O token de acesso, o Phone Number ID e o Group ID são variáveis protegidas (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GROUP_ID`) disponíveis somente no servidor. O destino precisa ser um grupo criado pela Groups API e o negócio precisa ser OBA com a permissão `whatsapp_business_messaging`; canais e grupos comuns não são compatíveis. Os participantes entram voluntariamente pelo convite oficial. A versão Graph API inicial será `v26.0`, conforme a referência oficial consultada.

Ao cadastrar qualquer produto ativo em produção, inserir o produto e o registro de anúncio numa transação idempotente (`whatsapp_product_announcements`, único por produto), mesmo quando os segredos ainda não estiverem configurados. Sem segredos ou grupo, o registro permanece pendente sem consumir tentativa; depois do commit, tentar enviar imediatamente sem fazer uma falha da Meta cancelar o cadastro. Buscar a imagem por URL temporária do armazenamento, normalizá-la a JPEG de até 5 MB com `sharp`, enviar pela Media Upload API e usar o `media_id` num anúncio de imagem para o grupo (`recipient_type: group`). A legenda inclui título, preço à vista, Pix, parcelas/juros e observações somente quando cadastrados, além de uma URL absoluta para `/produto/:id/`. Não enviar o link de afiliado no anúncio; a página pública continua usando o link de afiliado original no botão “Compre aqui”. Edições e produtos inativos não geram anúncio.

A fila grava estado, quantidade de tentativas, próximo retry, código técnico sanitizado, horário de envio e ID da mensagem. Um Heartbeat independente do Mercado Livre processa itens pendentes a cada cinco minutos, com backoff limitado e teto de oito tentativas; lease final expirada é marcada como falha. A fila deduplica o registro por produto e evita claims simultâneos, mas a entrega é at-least-once: se a Meta aceitar uma mensagem e a resposta se perder, a tentativa repetida pode duplicar o anúncio. O callback valida a identidade/tarefa Heartbeat e usa lease; o painel de administração mostra a configuração/estado e permite ativar ou desativar essa rotina. Segredos e respostas técnicas da Meta nunca são enviados ao cliente ou gravados em logs.

Enquanto `https://vitrine-ecps2ye7.manus.space/` não estiver ativo (a última checagem recebeu 404), continuar usando o domínio atual `https://vitrineml-ecps2ye7.manus.space/` para o link absoluto do anúncio e manter callbacks OAuth e metadados existentes. O anúncio deriva sua origem de `PUBLIC_SITE_ORIGIN` (HTTPS, quando configurado) e usa o domínio atual como fallback. Após ativação real do novo domínio, atualizar o host canônico, callbacks Google/Mercado Livre e metadados; não encaminhar usuários ao host que ainda não serve o site.

## Design

Reutilizar o estilo de administração e de catálogo já existente: mesmos rótulos, cartões, espaçamentos, badges e estados responsivos. Não criar um novo tema nem ilustrações. A interação deixa explícito o que é sincronizado e quando foi verificado; estados incertos são informativos, sem sugerir certeza nem bloquear uma compra por falha técnica.

## Estrutura principal do projeto

- `client/src/`: formulário administrativo, catálogo, detalhe do produto e componentes de preço/disponibilidade.
- `server/`: tRPC, autorização administrativa, consultas/mutações, adaptadores Mercado Livre, OAuth e sincronização Heartbeat.
- `drizzle/`: schema MySQL e migrações aditivas.
- `shared/`: tipos e validações puras compartilhadas entre interface e backend.
- `TODO.md`: critérios de produto e estado de execução; `plan.md`: decisões técnicas e interação.
