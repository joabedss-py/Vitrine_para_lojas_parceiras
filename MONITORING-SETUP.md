# Configuração do monitor Mercado Livre

O código do monitor está preparado, mas só começa a consultar a loja depois de publicar esta versão, configurar uma aplicação de desenvolvedor e autorizar uma conta Mercado Livre. A integração usa OAuth oficial com escopos `read` e `offline_access`; a API fornece preço da listagem e estado da oferta, não condições atuais de Pix/cartão. [1] [2]

## 1. Registar a aplicação

Crie uma aplicação no portal oficial de desenvolvedores do Mercado Livre e cadastre exatamente esta URI de redirecionamento:

```text
https://vitrineml-ecps2ye7.manus.space/api/oauth/mercadolivre/callback
```

Guarde o `Client ID` e o `Client Secret`. Quando tiver os dois valores, avise-me para solicitá-los em um formulário seguro do projeto. Não os envie no chat, no código ou no Git. Eles ainda não foram coletados nem configurados.

## 2. Conectar e habilitar

Depois de configurar as credenciais e publicar esta versão, entre em `/admin` com a conta autorizada e conecte o Mercado Livre. Após o retorno do provedor, clique em **Ativar agendamento**.

O worker acorda a cada 15 minutos, mas só consulta cada produto quando ele vence: depois de uma leitura confirmada, o próximo ciclo daquele item ocorre em seis horas. Falhas transitórias usam backoff exponencial e respeitam o `Retry-After` informado pela API. Depois de oito falhas consecutivas, a automação daquele produto pausa até o administrador corrigir a URL ou reconectar; a verificação manual continua disponível na versão publicada.

Ao cadastrar ou editar um produto monitorado, escolha **Mercado Livre**, informe a URL HTTPS canônica do anúncio original e ative o monitor. Mantenha o link de afiliado no campo separado: ele continua sendo o destino do botão **Compre aqui**. Links curtos como `meli.la` não servem como URL canônica de origem.

## O que é sincronizado

A Vitrine atualiza o preço à vista e o preço original quando a fonte fornece um valor de referência válido; se a API omitir o campo de preço original, o valor já cadastrado é preservado. Os campos Pix, parcelas, frete e promoção continuam manuais, pois esta consulta não confirma essas condições. Se o produto estiver sem estoque confirmado ou indisponível, ele permanece visível com o aviso correspondente e o botão de compra fica desativado. Falhas de rede, autorização ou limite da API preservam o último preço e estado confirmados. A quantidade pública do Mercado Livre pode ser apresentada por faixas e não é exibida como número exato. [1]

Para acrescentar outro e-commerce, será necessário incluir um adaptador para a API ou feed oficial da loja. O sistema não tenta raspar URLs arbitrárias.

## Referências

[1]: https://developers.mercadolibre.com.sv/en_us/users-addresses/items-and-searches "Documentação Mercado Livre sobre itens e buscas"
[2]: https://developers.mercadolibre.com.sv/en_us/users-addresses/authentication-and-authorization "Documentação Mercado Livre sobre autenticação e autorização"
