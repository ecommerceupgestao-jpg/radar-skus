# Radar de SKUs

Site da Cellfy que analisa a planilha **Fluxo de saída por SKU** e mostra o que fazer hoje:

- rupturas
- vendas disparando (ponderar preço)
- SKUs que pararam de vender
- quedas fortes
- estoque encalhado
- estoque divergente entre WMS e Anymarket

No site também dá para:

- filtrar por fornecedor e por SKU;
- abrir a análise de cada SKU, com as saídas diárias do período escolhido;
- anotar em cada SKU o que foi decidido. SKUs com anotação ganham uma caixinha vermelha **NOTA**, ou **REVISAR** quando a data de revisão chega.

```
index.html              o site
config.js               endereço do backend (você edita)
apps-script/Codigo.gs   backend no Google Apps Script
apps-script/appsscript.json
```

O repositório tem só código. Os dados ficam no Google: a planilha original e uma planilha nova, **Radar de SKUs – dados**, que o script cria no seu Drive para guardar o histórico diário e as anotações.

---

## 1. Backend no Google Apps Script (uns 10 minutos)

1. Entre em **script.google.com** com a conta @cellfy.com.br que tem acesso à planilha e crie um **Novo projeto**. Dê o nome *Radar de SKUs*.
2. Apague o conteúdo de `Código.gs`, cole o conteúdo de `apps-script/Codigo.gs` e salve.
3. Na linha `SENHA: 'TROQUE-ESTA-SENHA'`, coloque uma senha sua. Ela vai ser pedida no site. Como o site é público, **não deixe em branco**.
4. Em **Configurações do projeto** (engrenagem), marque "Mostrar arquivo de manifesto appsscript.json". Volte ao editor e troque o conteúdo de `appsscript.json` pelo arquivo do mesmo nome desta pasta. Isso garante o fuso de São Paulo.
5. No topo do editor, escolha a função **instalar** e clique em **Executar**. Autorize o acesso quando o Google pedir. Esse passo:
   - cria a planilha *Radar de SKUs – dados*;
   - agenda a execução automática diária por volta das 09:40;
   - grava o primeiro dia de histórico.
6. Clique em **Implantar → Nova implantação → tipo App da Web** e preencha:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Clique em **Implantar** e copie a **URL do app da Web**. Ela termina em `/exec`.

> Se você alterar o `Codigo.gs` depois, use **Implantar → Gerenciar implantações → editar → Nova versão**. Assim a URL continua a mesma.

## 2. Site no GitHub Pages

1. Abra `config.js` e cole a URL `/exec` no lugar de `COLE_AQUI_A_URL_DO_APPS_SCRIPT`.
2. No GitHub, crie um repositório (ex.: `radar-skus`) e envie `index.html`, `config.js` e a pasta `apps-script`. Pode ser pelo botão **Add file → Upload files**.
3. Vá em **Settings → Pages**. Em *Build and deployment* escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em 1 ou 2 minutos o site fica no ar em `https://SEU-USUARIO.github.io/radar-skus/`.
5. Abra o site e digite a senha do passo 1.3. O navegador guarda a senha para as próximas visitas.

## Como funciona

- **Automático:** todo dia por volta das 09:40 o Apps Script grava a coluna "Desde Ontem" de cada SKU como as vendas do dia anterior. É isso que forma o gráfico de saídas diárias, que ganha um dia a cada execução.
- **Botão "Rodar análise agora":** faz a mesma gravação na hora e recarrega o site.
- **Análise:** é calculada no navegador com os números da planilha. A planilha não tem preço, margem nem concorrência, então as sugestões de preço indicam uma direção, não um valor exato.
- **Anotações:** ficam na aba *Anotacoes* da planilha *Radar de SKUs – dados*. Também dá para ver e editar por lá.

### Ajustes

- Os critérios dos alertas ficam no começo do script do `index.html`, na linha `const P={LEAD_N:15,LEAD_I:60,...}`:
  - lead de reposição: 15 dias para nacional, 60 para importado;
  - aceleração: 1,6× o ritmo normal;
  - queda: ritmo abaixo de 45% do normal;
  - encalhe: mais de 120 dias de cobertura.
- Os marcadores das anotações ficam na linha `const TAGS=[...]`.

### Privacidade

O código no GitHub não contém dados. Quem tiver o link do site só vê alguma coisa se tiver a senha. Ainda assim é uma proteção simples: troque a senha no `Codigo.gs` e reimplante se ela vazar.
