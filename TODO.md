# Entregas

- [x] **Administração segura do catálogo e armazenamento das imagens** — O site oferece uma área nos bastidores para inserir produtos e links de afiliado. A área administrativa permite cadastrar, editar e remover produtos; cada produto guarda seu próprio link de afiliado associado ao botão de compra. O cadastro aceita título, descrição, preço, imagem, categoria e os demais detalhes essenciais do produto. As imagens enviadas pelo administrador ficam em armazenamento durável, e dados e links são persistidos no banco. A administração exige autenticação OAuth e permissão de administrador vinculada à identidade autorizada.

- [x] **Vitrine pública, busca e detalhes do produto** — No front-end, o usuário final visualiza os produtos cadastrados com seus detalhes. A vitrine apresenta uma listagem responsiva e oferece busca e filtros básicos por categoria. Cada produto tem uma página de detalhes acessível ao visitante.

- [x] **Compra pelo link de afiliado e transparência** — O botão exibe o texto “Compre aqui” e redireciona para o link de afiliado configurado para aquele produto, validado como endereço HTTPS do Mercado Livre ou link curto meli.la. O site exibe aviso transparente de que alguns links são de afiliado e de que a compra ocorre no Mercado Livre.

- [x] **Login Google para a área administrativa publicada** — O administrador poderá iniciar sessão na área `/admin` com Google usando o OAuth client cadastrado; somente a conta Google cujo e-mail corresponde ao `ADMIN_EMAIL` autorizado poderá editar o catálogo. O login Manus continua disponível como alternativa, e as credenciais Google ficam somente no servidor de produção. A publicação foi verificada com Google habilitado e callback correto.

- [x] **Reduzir travamentos e lentidão** — A vitrine deve responder e rolar com mais fluidez, reduzindo trabalho de carregamento de imagens e de listagens, sem alterar o cadastro dos produtos, seus links de afiliado ou o fluxo de compra.

- [x] **Atualizar o e-mail administrador e publicar nova versão** — Trocar o e-mail autorizado do administrador por meio do formulário protegido de produção, manter esse valor somente em segredo do ambiente e publicar uma nova versão do site. Somente a identidade autorizada deve continuar com acesso à administração.

- [x] **Preço sem teto comercial** — Permitir cadastrar, editar e exibir preços acima do limite fixo atual, removendo o teto comercial do campo e preservando o valor e os centavos no banco e na vitrine. A implementação deve usar a maior precisão decimal suportada pelo armazenamento sem alterar preços existentes.

- [x] **Travessão menor no título do site** — Reduzir a presença visual do travessão longo no título “Vitrine — seleção de produtos”, mantendo o nome e o restante do título.
