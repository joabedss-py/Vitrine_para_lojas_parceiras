# Entregas

- [x] **Administração segura do catálogo e armazenamento das imagens** — O site oferece uma área nos bastidores para inserir produtos e links de afiliado. A área administrativa permite cadastrar, editar e remover produtos; cada produto guarda seu próprio link de afiliado associado ao botão de compra. O cadastro aceita título, descrição, preço, imagem, categoria e os demais detalhes essenciais do produto. As imagens enviadas pelo administrador ficam em armazenamento durável, e dados e links são persistidos no banco. A administração exige autenticação OAuth e permissão de administrador vinculada à identidade autorizada.

- [x] **Vitrine pública, busca e detalhes do produto** — No front-end, o usuário final visualiza os produtos cadastrados com seus detalhes. A vitrine apresenta uma listagem responsiva e oferece busca e filtros básicos por categoria. Cada produto tem uma página de detalhes acessível ao visitante.

- [x] **Compra pelo link de afiliado e transparência** — O botão exibe o texto “Compre aqui” e redireciona para o link de afiliado configurado para aquele produto, validado como endereço HTTPS do Mercado Livre ou link curto meli.la. O site exibe aviso transparente de que alguns links são de afiliado e de que a compra ocorre no Mercado Livre.

- [ ] **Login Google para a área administrativa publicada** — O administrador poderá iniciar sessão na área `/admin` com Google usando o OAuth client que cadastrou; somente a conta Google cujo e-mail corresponde ao `ADMIN_EMAIL` autorizado poderá editar o catálogo. O login Manus continuará disponível como alternativa, e credenciais Google serão mantidas somente no servidor do ambiente de produção.
