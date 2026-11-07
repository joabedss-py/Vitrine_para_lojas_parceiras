# Plano: catálogo afiliado multiloja e monitoramento

## Objetivo e decisões

A vitrine aceita um destino de afiliado HTTPS de qualquer e-commerce, incluindo Mercado Livre, Shopee e outras lojas. O botão “Compre aqui” usa exatamente o `affiliateUrl` salvo, sem resolver encurtadores, visitar esse destino no servidor ou substituir parâmetros de afiliado. O campo opcional de loja identifica a origem comercial; o reconhecimento visual do domínio é apenas informativo.

A configuração do monitoramento sai do cadastro de produtos e passa para a área restrita `/admin/monitoramento`. O cadastro `/admin` continua responsável pelo catálogo, preços, imagens e link de compra. `sourceProvider` e `sourceUrl` identificam separadamente a fonte canônica que o monitor consulta; nunca são deduzidos do link de afiliado.

O monitor usa adaptadores explícitos por loja e API/feed oficial; não raspa páginas arbitrárias. O único adaptador atualmente implementado é o Mercado Livre. Links afiliados Shopee e de outras lojas podem ser cadastrados e usados como destino de compra, mas monitoramento automático dessas lojas só será habilitado quando houver adaptador oficial e sua autenticação correspondente.

Para Mercado Livre será usado OAuth 2.0 de leitura (`read` e `offline_access`) e a API oficial. O acesso exige credenciais de uma aplicação de desenvolvedor e autorização da conta Mercado Livre; segredos não serão colocados no navegador, no código ou no Git. Access/refresh tokens ficam cifrados com AES-256-GCM; refresh tokens, que são rotativos e de uso único, serão substituídos atomicamente.

O administrador pode ativar/desativar o monitor por produto, consultar o último resultado e solicitar uma verificação manual. O Heartbeat do Webdev acorda a cada 15 minutos e reivindica o job com um lease para impedir callbacks duplicados; cada produto confirmado só volta a ser consultado após seis horas. As falhas recebem backoff exponencial, respeitam `Retry-After` e pausam a automação daquele produto após oito tentativas até correção/reconexão; erros técnicos não mudam preço nem marcam o item como esgotado.

O preço oficial da listagem atualizará o preço à vista da Vitrine; preço original só será sincronizado quando o adaptador o fornecer. O endpoint Mercado Livre não é fonte confiável de parcelas ou preço Pix, então essas condições ficam manuais e devem ser identificadas como não verificadas automaticamente. A disponibilidade confirmada como zero/anúncio indisponível deixa o produto visível com selo “Indisponível” e desativa “Compre aqui”; o administrador ainda pode ocultá-lo manualmente. A quantidade pública do Mercado Livre pode vir em faixas, portanto a interface não afirmará uma contagem exata. Se a última consulta bem-sucedida tiver mais de 24 horas (ou não existir), mostrar “Disponibilidade não confirmada” e manter o link clicável para o visitante confirmar na loja; só desativar o botão diante de indisponibilidade confirmada em consulta recente.

## Implementação e estrutura

- `drizzle/schema.ts` já armazena link de afiliado, nome de loja, provedor/URL de origem, ativação do monitor, disponibilidade e horários. Esta mudança não exige novo campo nem migração.
- `server/marketplaces/` define a interface `MarketplaceProvider`, o registro de adaptadores e a implementação atual do Mercado Livre. Um adaptador futuro só poderá ser adicionado com origem, autenticação, API/feed oficial e validação próprios.
- `server/productMonitor.ts`, `server/db.ts` e `server/routers.ts` mantêm o worker e o fluxo atual de monitoramento. Uma mutação administrativa dedicada atualizará apenas os campos de origem/monitor do produto, preservando o `affiliateUrl`, o preço, Pix, parcelas e outras condições comerciais.
- `client/src/pages/AdminPage.tsx` fica dedicada ao cadastro, edição, remoção e link de afiliado. A área informa que aceita Shopee e outras lojas, mostra o domínio reconhecido apenas como auxílio visual e preserva o destino informado.
- `client/src/pages/AdminMonitoringPage.tsx` concentra conexão Mercado Livre, agendamento, lista de produtos, URL canônica, ativação/desativação, status e verificação manual. A rota `/admin/monitoramento` mantém a autenticação de administrador e usa os procedimentos server-side protegidos existentes.
- `client/src/App.tsx` registra a rota e `client/public/manus-routes.json` declara o novo caminho. O retorno do OAuth Mercado Livre volta à página de monitoramento.
- `shared/affiliate-url.ts` centraliza validação HTTPS e reconhecimento informativo de domínios conhecidos, com testes que cobrem Shopee, outra loja HTTPS, host falso e protocolo inseguro. O reconhecimento não altera a URL.

## Dados e compatibilidade

Não haverá migração nem backfill: os produtos atuais mantêm links, preços, condições, imagem e estado de monitoramento. A edição de um produto no cadastro preservará as configurações de monitor existentes; somente a página de monitoramento poderá alterá-las. Atualizar monitoramento não altera `pricePix`/`pixPrice`, parcelas, juros, preço manual ou destino de afiliado.

O reconhecimento da plataforma não transforma URLs nem determina `sourceProvider`. Uma URL Shopee é válida como destino de afiliado, mas não como fonte de monitoramento até existir adaptador Shopee oficial. Produtos sem adaptador continuam editáveis manualmente e nunca serão consultados por scraping genérico.

A callback da aplicação Mercado Livre usa `https://vitrineml-ecps2ye7.manus.space/api/oauth/mercadolivre/callback`. Em produção, o administrador inicia a conexão e habilita o job; o ambiente Preview não tenta criar tarefas de produção.

O banco Webdev é compartilhado entre desenvolvimento e produção; a implementação e os testes não devem escrever nem apagar produtos reais. Testes de APIs externas usam respostas mockadas.

## Preparação manual para Canais do WhatsApp

A Vitrine não tem endpoint oficial da Meta para publicar em Canais. Nesta entrega não serão usados API/serviço externo, credencial WhatsApp ou envio automático para grupos e conversas individuais. O cadastro e as validações existentes permanecem iguais; a preparação é um efeito lateral administrativo, não uma nova etapa obrigatória do formulário.

Reaproveitar a fila `whatsapp_product_announcements`, já única por produto, acrescentando texto preparado, horário de preparação e estados explícitos `prepared`, `published_manually` e `cancelled`. O cadastro de produto ativo e a criação do registro preparado ocorrem na mesma transação; produto inativo não cria anúncio. Ao editar um item preparado, atualizar seu snapshot sem criar outra linha; ao desativá-lo, cancelar a preparação; na transição de inativo para ativo, preparar uma vez. Um produto já marcado como publicado manualmente não volta a ser preparado automaticamente. O estado `published_manually` só muda por ação explícita do administrador.

O snapshot de texto inclui título, descrição, preço à vista, condições comerciais somente quando cadastradas e o link público `/produto/:id/`. A imagem não é copiada a outro serviço: a área administrativa apresenta a URL pública de armazenamento para abrir/baixar. O botão “Compre aqui” na página continua usando o link de afiliado já cadastrado; ele não é substituído pelo link do anúncio.

A área administrativa lista produtos com preparação `prepared` e `published_manually`, mostra o texto e os detalhes da imagem/página, permite copiar o anúncio, abrir imagem e página pública, e marcar a publicação manualmente concluída. Só apresenta itens ativos; preparação cancelada ou produto inativo não é publicável pelo painel. O bloqueio de linha por produto durante a transação, combinado ao índice único existente, impede registros de preparação duplicados.

Desativar o caminho anterior de envio automático: remover o envio Graph API, as retentativas/Heartbeat de anúncios em grupo, seu callback e os controles de credenciais/agendamento. Manter somente as funções Heartbeat de monitoramento de produtos. Como a fila e o agendamento atuais foram verificados sem registros, a migração necessária é aditiva e não precisa transformar dados existentes.

Links absolutos usam `ENV.publicSiteOrigin`, com fallback explícito para `https://vitrineml-ecps2ye7.manus.space/`, verificado como HTTP 200 em 2 nov. 2026. O domínio pretendido `https://vitrine-ecps2ye7.manus.space/` ainda retorna HTTP 404 e não será usado até funcionar. Callbacks OAuth, metadados e domínio do site não são alterados nesta tarefa, exceto o caminho interno pós-OAuth, que passa a `/admin/monitoramento`.

## Design

Reutilizar o estilo de administração e de catálogo já existente: mesmos rótulos, cartões, espaçamentos, badges e estados responsivos. Não criar um novo tema nem ilustrações. A interação deixa explícito o que é sincronizado e quando foi verificado; estados incertos são informativos, sem sugerir certeza nem bloquear uma compra por falha técnica.

## Estrutura principal do projeto

- `client/src/`: catálogo público, formulário administrativo e página protegida de monitoramento.
- `server/`: tRPC, autorização administrativa, consultas/mutações, adaptadores Mercado Livre, OAuth e sincronização Heartbeat.
- `drizzle/`: schema MySQL e migrações aditivas já existentes; esta mudança não cria migration.
- `shared/`: preços, URLs/validação de afiliados, disponibilidade e tipos compartilhados.
- `TODO.md`: critérios de produto e estado de execução; `plan.md`: decisões técnicas e interação.
