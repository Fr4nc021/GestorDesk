# GestorDesk

O **GestorDesk** e um sistema de gestao comercial desktop para lojas, com foco em operacao diaria de vendas, estoque, caixa e analise de desempenho.

Ele roda com **Electron + React**, utiliza **SQLite local** para funcionamento offline e possui **sincronizacao com Supabase** para manter dados entre diferentes computadores.

## O que o sistema faz

O sistema centraliza o fluxo de operacao da loja em um unico aplicativo:

- realiza vendas no PDV com controle de itens e pagamentos
- atualiza estoque automaticamente a cada venda
- gerencia cadastro de produtos, variacoes e etiquetas
- controla parceiros (artesaos/fornecedores)
- acompanha movimentacao financeira no caixa
- gera relatorios de vendas, lucro e produtos mais vendidos
- sincroniza dados locais com a nuvem (Supabase)

## Funcionalidades por modulo

### Login e acesso

- autenticacao de usuario e senha
- rotas protegidas para impedir acesso sem login
- sessao local do usuario logado

### Dashboard

- visao geral da operacao
- total vendido no dia
- quantidade de vendas do dia
- quantidade de produtos ativos e itens em estoque
- vendas recentes
- variacao percentual em relacao ao mes anterior
- botao de sincronizacao manual

### PDV (Ponto de Venda)

- busca de produto por codigo de barras
- pesquisa de produto por modal
- carrinho com ajuste de quantidade e remocao de itens
- desconto por valor (R$) ou percentual (%)
- multiplas formas de pagamento na mesma venda
- calculo de troco para pagamento em dinheiro
- atalho de teclado para finalizar venda (F1)
- validacao de estoque antes de concluir venda

### Produtos

- cadastro, edicao e exclusao de produtos
- vinculacao de produto ao artesao
- precos de custo e venda
- controle de estoque por produto
- gestao de variacoes (tipos e valores, ex.: tamanho e cor)
- busca por nome ou codigo
- impressao de etiquetas com codigo de barras
- configuracao de tamanho de etiqueta/papel para impressao

### Artesaos

- cadastro, edicao e exclusao de artesaos
- telefone/WhatsApp do parceiro
- busca por nome
- visualizacao da quantidade de produtos relacionados

### Estoque

- consulta de estoque atual por produto
- entrada manual de estoque (reposicao)
- historico de movimentacoes (entrada e saida)
- filtros por periodo (de/ate)
- consulta de produtos mais vendidos por periodo

### Caixa

- visualizacao de transacoes por dia
- filtro por forma de pagamento (dinheiro, pix, credito, debito)
- total diario por filtro
- exclusao de venda com estorno de estoque
- exportacao de relatorio de caixa em PDF por periodo

### Relatorios

- **Vendas Geral**: total vendido, ticket medio, itens vendidos e vendas por dia
- **Por Artesao**: desempenho filtrado por parceiro
- **Lucro**: calculo de lucro por periodo com base em custo x venda
- **Mais Vendidos**: ranking de produtos por quantidade vendida
- exportacao de relatorios em PDF

### Configuracoes

- listagem de usuarios locais
- exclusao de usuarios (com protecao para usuario admin)
- sincronizacao manual com a nuvem

### Sincronizacao (SQLite <-> Supabase)

- envio de registros pendentes do banco local para o Supabase
- download dos dados do Supabase para atualizar o banco local
- sincronizacao automatica periodica e opcao manual
- suporte a operacao offline com sincronizacao posterior

## Tecnologias utilizadas

- **Electron** (aplicacao desktop)
- **React** (interface)
- **Vite** (build e dev server)
- **React Router** (rotas e navegacao)
- **SQLite + better-sqlite3** (persistencia local)
- **Supabase** (sincronizacao/autenticacao na nuvem)
- **jsPDF** (geracao de PDF)
- **Recharts** (graficos)
- **react-barcode / JsBarcode** (codigo de barras e etiquetas)

## Como executar

### 1) Instalar dependencias

```bash
npm install
```

### 2) Rodar em modo desktop (recomendado)

```bash
npm start
```

Esse comando sobe o frontend (Vite) e abre o app Electron.

### 3) Rodar apenas frontend (sem Electron)

```bash
npm run dev
```

> Observacao: funcionalidades que dependem de banco local via Electron podem nao funcionar no navegador puro.

## Build para distribuicao

```bash
npm run dist
```

O build gera os instaladores/artefatos na pasta `release/`.

## Scripts uteis

- `npm run lint` - analise de codigo com ESLint
- `npm run build` - build do frontend
- `npm run dist` - build desktop com Electron Builder
- `npm run sync:full` - rotina de sincronizacao completa
- `npm run clean:db` - limpeza de dados antes de build

## Instalacao em outro PC

Para instalar o GestorDesk em outro computador (instalador `.exe` ou a partir do codigo-fonte), consulte o guia **[INSTALACAO.md](./INSTALACAO.md)**.
