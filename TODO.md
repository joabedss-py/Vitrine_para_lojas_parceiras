# Entregas

- [x] **Administração segura do catálogo e armazenamento das imagens** — O site oferece uma área nos bastidores para inserir produtos e links de afiliado. A área administrativa permite cadastrar, editar e remover produtos; cada produto guarda seu próprio link de afiliado associado ao botão de compra. O cadastro aceita título, descrição, preço, imagem, categoria e os demais detalhes essenciais do produto. As imagens enviadas pelo administrador ficam em armazenamento durável, e dados e links são persistidos no banco. A administração exige autenticação OAuth e permissão de administrador vinculada à identidade autorizada.

- [x] **Vitrine pública, busca e detalhes do produto** — No front-end, o usuário final visualiza os produtos cadastrados com seus detalhes. A vitrine apresenta uma listagem responsiva e oferece busca e filtros básicos por categoria. Cada produto tem uma página de detalhes acessível ao visitante.

- [x] **Links de afiliado para diferentes lojas** — A área administrativa aceita um link HTTPS de afiliado para qualquer loja de e-commerce, sem limitar produtos ao Mercado Livre, e permite informar opcionalmente a loja/vendedor. O botão “Compre aqui” direciona para o link configurado para aquele produto. A vitrine e os avisos informam genericamente que a compra é concluída no site da loja parceira e que alguns links são de afiliado, sem custo adicional para o usuário.

- [x] **Login Google para a área administrativa publicada** — O administrador poderá iniciar sessão na área `/admin` com Google usando o OAuth client cadastrado; somente a conta Google cujo e-mail corresponde ao `ADMIN_EMAIL` autorizado poderá editar o catálogo. O login Manus continua disponível como alternativa, e as credenciais Google ficam somente no servidor de produção. A publicação foi verificada com Google habilitado e callback correto.

- [x] **Reduzir travamentos e lentidão** — A vitrine deve responder e rolar com mais fluidez, reduzindo trabalho de carregamento de imagens e de listagens, sem alterar o cadastro dos produtos, seus links de afiliado ou o fluxo de compra.

- [x] **Atualizar o e-mail administrador e publicar nova versão** — Trocar o e-mail autorizado do administrador por meio do formulário protegido de produção, manter esse valor somente em segredo do ambiente e publicar uma nova versão do site. Somente a identidade autorizada deve continuar com acesso à administração.

- [x] **Preço sem teto comercial** — Permitir cadastrar, editar e exibir preços acima do limite fixo anterior, removendo o teto comercial do campo e preservando o valor e os centavos no banco e na vitrine. A implementação usa a maior precisão decimal suportada pelo armazenamento sem alterar preços existentes.

- [x] **Travessão menor no título do site** — Reduzir a presença visual do travessão longo no título “Vitrine — seleção de produtos”, mantendo o nome e o restante do título.

- [x] **Preços e condições de pagamento transparentes** — No formulário administrativo, permitir informar o preço à vista, o preço no Pix e o preço por parcela no cartão; para o cartão, permitir informar o número de parcelas e se a condição é sem juros ou com juros. Permitir também informar o preço original de referência para calcular o desconto e uma observação opcional de frete ou promoção. Na vitrine e nos detalhes, apresentar apenas as condições cadastradas, incluindo preço à vista, Pix, parcelas, total no cartão, desconto e observação quando informados; não afirmar “sem juros”, “frete grátis” ou desconto quando esses dados não foram cadastrados.

- [x] **Entrada flexível de preços** — Nos campos de cadastro, aceitar vírgula e ponto como separador decimal, com ou sem separadores de milhar (por exemplo, `9.699,00`, `9,699.00`, `9699,00` e `9699.00`), normalizando o valor sem perda de centavos. Somente o preço à vista principal permanece obrigatório; preço original, Pix, cartão e observações continuam opcionais. Quando houver preço parcelado, valor por parcela e quantidade devem ser informados juntos.

- [x] **Corrigir bloqueio de cadastro de preços** — O formulário aceita valores como `9.699,00` sem bloqueio nativo do navegador; a validação ocorre pelo parser monetário do sistema e apresenta mensagem compreensível quando o formato é inválido, preservando os campos opcionais.

- [x] **URL e título específicos por produto** — Ao clicar em um produto, abrir uma URL que contenha o código/ID do produto e um trecho legível do nome dele; a página e o título do navegador devem identificar aquele produto. Manter links antigos de produto compatíveis e atualizar o manifesto de rotas.

- [x] **Reduzir um pouco o tamanho dos nomes dos produtos** — Diminuir moderadamente a tipografia dos títulos dos produtos nos cards da vitrine, na página de detalhes e na lista administrativa, incluindo telas móveis, preservando a hierarquia e a legibilidade e sem alterar a tipografia dos preços.
