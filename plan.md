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

## Preparação manual para Canais do WhatsApp

A Vitrine não tem endpoint oficial da Meta para publicar em Canais. Nesta entrega não serão usados API/serviço externo, credencial WhatsApp ou envio automático para grupos e conversas individuais. O cadastro e as validações existentes permanecem iguais; a preparação é um efeito lateral administrativo, não uma nova etapa obrigatória do formulário.

Reaproveitar a fila `whatsapp_product_announcements`, já única por produto, acrescentando texto preparado, horário de preparação e estados explícitos `prepared`, `published_manually` e `cancelled`. O cadastro de produto ativo e a criação do registro preparado ocorrem na mesma transação; produto inativo não cria anúncio. Ao editar um item preparado, atualizar seu snapshot sem criar outra linha; ao desativá-lo, cancelar a preparação; na transição de inativo para ativo, preparar uma vez. Um produto já marcado como publicado manualmente não volta a ser preparado automaticamente. O estado `published_manually` só muda por ação explícita do administrador.

O snapshot de texto inclui título, descrição, preço à vista, condições comerciais somente quando cadastradas e o link público `/produto/:id/`. A imagem não é copiada a outro serviço: a área administrativa apresenta a URL pública de armazenamento para abrir/baixar. O botão “Compre aqui” na página continua usando o link de afiliado já cadastrado; ele não é substituído pelo link do anúncio.

A área administrativa lista produtos com preparação `prepared` e `published_manually`, mostra o texto e os detalhes da imagem/página, permite copiar o anúncio, abrir imagem e página pública, e marcar a publicação manualmente concluída. Só apresenta itens ativos; preparação cancelada ou produto inativo não é publicável pelo painel. O bloqueio de linha por produto durante a transação, combinado ao índice único existente, impede registros de preparação duplicados.

Desativar o caminho anterior de envio automático: remover o envio Graph API, as retentativas/Heartbeat de anúncios em grupo, seu callback e os controles de credenciais/agendamento. Manter somente as funções Heartbeat de monitoramento de produtos. Como a fila e o agendamento atuais foram verificados sem registros, a migração necessária é aditiva e não precisa transformar dados existentes.

Links absolutos usam `ENV.publicSiteOrigin`, com fallback explícito para `https://vitrineml-ecps2ye7.manus.space/`, verificado como HTTP 200 em 2 nov. 2026. O domínio pretendido `https://vitrine-ecps2ye7.manus.space/` ainda retorna HTTP 404 e não será usado até funcionar. Callbacks OAuth, metadados e domínio do site não são alterados nesta tarefa.

Os módulos afetados são `drizzle/schema.ts` e uma migração aditiva; `server/db.ts` e `server/routers.ts` para persistência e autorização; `shared/whatsapp-announcement.ts` para formatação pura compartilhada; `client/src/pages/AdminPage.tsx` para visualização e ações; e `server/_core/index.ts` para retirar somente o callback antigo de mensagens. O módulo do sender de grupos e a dependência de conversão de imagem são removidos se não tiverem outros usos. Os testes cobrem composição do texto e condições opcionais; o link público e a exclusão do afiliado são cobertos por teste, enquanto a idempotência decorre da transação e do índice único. Nenhum teste envia mensagens nem grava dados reais de produto.

## Design

Reutilizar o estilo de administração e de catálogo já existente: mesmos rótulos, cartões, espaçamentos, badges e estados responsivos. Não criar um novo tema nem ilustrações. A interação deixa explícito o que é sincronizado e quando foi verificado; estados incertos são informativos, sem sugerir certeza nem bloquear uma compra por falha técnica.

## Estrutura principal do projeto

- `client/src/`: formulário administrativo, catálogo, detalhe do produto e componentes de preço/disponibilidade.
- `server/`: tRPC, autorização administrativa, consultas/mutações, adaptadores Mercado Livre, OAuth e sincronização Heartbeat.
- `drizzle/`: schema MySQL e migrações aditivas.
- `shared/`: tipos e validações puras compartilhadas entre interface e backend.
- `TODO.md`: critérios de produto e estado de execução; `plan.md`: decisões técnicas e interação.
