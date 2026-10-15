# Pedidos em Trânsito

- **Módulo:** COMPRAS / ESTOQUE
- **Tela:** Pedidos em Trânsito
- **URL:** `/pedidos-compra`
- **Título na página:** Pedidos de Compra

## Objetivo (inferido)

Tela "Pedidos em Trânsito" do módulo COMPRAS / ESTOQUE. Apresenta listagem em tabela com colunas NF, Fornecedor, Data Pedido, Previsao, Valor, Itens. Possui 2 campo(s) de entrada/filtro. Texto de apoio: "Painel Pedidos de Compra Pedidos de Compra Gerencie pedidos de compra em transito, recebidos e cancelados. Novo Pedido Todos Em Transito Recebido Cancelado Exportar Colunas NF Fornecedor Data Pedido P…"

## Screenshot

![Pedidos em Trânsito](../img/compras-estoque-pedidos-em-transito.png)

## Campos

| Nome | Rótulo | Tipo | Obrigatório | Valores/opções |
|---|---|---|---|---|
| — | Buscar pedidos... | text | não indicado | — |
| — | — | combobox | não indicado | — |

## Botões e ações

- Buscar... ⌘K
- Toggle theme
- Customize theme
- Notifications
- GC
- Novo Pedido
- Todos
- Em Transito
- Recebido
- Cancelado
- Exportar
- Colunas
- NF
- Fornecedor
- Data Pedido
- Previsao
- Valor
- Itens
- Status
- 10
- Ir para primeira página _(desabilitado)_
- Ir para página anterior _(desabilitado)_
- Ir para próxima página _(desabilitado)_
- Ir para última página _(desabilitado)_

## Tabelas / grids

**Tabela 1** — 1 linha(s) visível(is)

- Colunas: NF · Fornecedor · Data Pedido · Previsao · Valor · Itens · Status
- Colunas possivelmente ordenáveis: NF, Fornecedor, Data Pedido, Previsao, Valor, Itens, Status

- Filtros/busca: Buscar pedidos...
- Paginação: Página 1 de 0

## Abas

_Nenhuma aba._

## Modais

_Nenhum modal aberto na carga da tela. Modais disparados por botões não foram abertos (regra somente-leitura)._

## Links para outras telas

- Painel → `/`

## Mensagens e validações visíveis

_Nenhuma mensagem visível._

<!-- estados -->
## Estados capturados (interações de visualização)

_Capturados em 15/10/2026 clicando só em itens de visualização do checklist da issue. Nenhum formulário foi preenchido e toda gravação foi bloqueada._

### Novo Pedido

![Novo Pedido](../img/estados/compras-estoque-pedidos-em-transito--novo-pedido.jpg)

- Abre modal **Novo Pedido de Compra**

| Campo | Tipo | Obrigatório | Opções |
|---|---|---|---|
| Fornecedor * | combobox | sim | — |
| Numero NF | text | não indicado | — |
| Data Pedido | date | não indicado | — |
| Previsao Entrega | date | não indicado | — |
| Valor Total (R$) | number | não indicado | — |
| Observacoes | textarea | não indicado | — |

- Botões do modal: Selecione o fornecedor · Adicionar Item · Cancelar · Criar Pedido · Close

### Todos

![Todos](../img/estados/compras-estoque-pedidos-em-transito--todos.jpg)


### Em Transito

![Em Transito](../img/estados/compras-estoque-pedidos-em-transito--em-transito.jpg)


### Recebido

![Recebido](../img/estados/compras-estoque-pedidos-em-transito--recebido.jpg)


### Cancelado

![Cancelado](../img/estados/compras-estoque-pedidos-em-transito--cancelado.jpg)


### Colunas

![Colunas](../img/estados/compras-estoque-pedidos-em-transito--colunas.jpg)

- Itens do menu/lista: Numero_nf · Fornecedor_nome · Data_pedido · Data_previsao · Valor_total · Qtd_itens · Status

### Ordenação por coluna — 1 print de exemplo (colunas: NF, Fornecedor, Data Pedido, Previsao, Valor, Itens, Status)

![Ordenação por coluna — 1 print de exemplo (colunas: NF, Fornecedor, Data Pedido, Previsao, Valor, Itens, Status)](../img/estados/compras-estoque-pedidos-em-transito--ordenacao-por-coluna-1-print-de-exemplo-colunas-nf.jpg)


### Paginação — 1 print da página 2

- lista com uma página só (botão de próxima página desabilitado), sem print

<!-- /estados -->
