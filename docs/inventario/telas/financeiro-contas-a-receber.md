# Contas a Receber

- **Módulo:** FINANCEIRO
- **Tela:** Contas a Receber
- **URL:** `/receber`
- **Título na página:** Contas a Receber

## Objetivo (inferido)

Tela "Contas a Receber" do módulo FINANCEIRO. Apresenta listagem em tabela com colunas #, Descricao, Cliente, Valor, Vencimento, Status. Possui 3 campo(s) de entrada/filtro. Texto de apoio: "Painel Contas a Receber Contas a Receber Gerencie suas contas a receber e receitas. Excel PDF Nova Conta Todos Pendente Recebido Vencido Vencimento de: até: Limpar Exportar Colunas # Descricao Cliente…"

## Screenshot

![Contas a Receber](../img/financeiro-contas-a-receber.png)

## Campos

| Nome | Rótulo | Tipo | Obrigatório | Valores/opções |
|---|---|---|---|---|
| — | Vencimento de: | date | não indicado | — |
| — | até: | date | não indicado | — |
| — | Buscar contas a receber... | text | não indicado | — |

## Botões e ações

- Buscar... ⌘K
- Toggle theme
- Customize theme
- Notifications
- GC
- Excel
- PDF
- Nova Conta
- Todos
- Pendente
- Recebido
- Vencido
- Limpar
- Exportar
- Colunas
- #
- Descricao
- Cliente
- Valor
- Vencimento
- Status
- Acoes
- Anterior _(desabilitado)_
- Proxima _(desabilitado)_

## Tabelas / grids

**Tabela 1** — 6 linha(s) visível(is)

- Colunas: # · Descricao · Cliente · Valor · Vencimento · Status
- Colunas possivelmente ordenáveis: #, Descricao, Cliente, Valor, Vencimento, Status

- Filtros/busca: Vencimento de:, até:, Buscar contas a receber...
- Paginação: não identificada

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

### Nova Conta

![Nova Conta](../img/estados/financeiro-contas-a-receber--nova-conta.jpg)

- Abre modal **Nova Conta a Receber**

| Campo | Tipo | Obrigatório | Opções |
|---|---|---|---|
| Descricao * | text | sim | — |
| Buscar cliente (nome, telefone)... | text | não indicado | — |
| Valor * | number | sim | — |
| Data de Vencimento * | date | sim | — |
| Forma de Pagamento | combobox | não indicado | — |
| Plano de Contas | combobox | não indicado | — |
| Documento | text | não indicado | — |
| Total Parcelas | number | não indicado | — |
| Status | combobox | não indicado | — |
| Observacoes | textarea | não indicado | — |

- Botões do modal: Selecione · Selecione (opcional) · Pendente · Cancelar · Cadastrar · Close

### Todos

![Todos](../img/estados/financeiro-contas-a-receber--todos.jpg)


### Pendente

![Pendente](../img/estados/financeiro-contas-a-receber--pendente.jpg)


### Recebido

![Recebido](../img/estados/financeiro-contas-a-receber--recebido.jpg)


### Vencido

![Vencido](../img/estados/financeiro-contas-a-receber--vencido.jpg)


### Limpar

![Limpar](../img/estados/financeiro-contas-a-receber--limpar.jpg)


### Colunas

![Colunas](../img/estados/financeiro-contas-a-receber--colunas.jpg)

- Itens do menu/lista: Id · Descricao · Cliente · Valor · Data_vencimento · Status

### Ordenação por coluna — 1 print de exemplo (colunas: #, Descricao, Cliente, Valor, Vencimento, Status)

![Ordenação por coluna — 1 print de exemplo (colunas: #, Descricao, Cliente, Valor, Vencimento, Status)](../img/estados/financeiro-contas-a-receber--ordenacao-por-coluna-1-print-de-exemplo-colunas-de.jpg)


### Menu de ações (⋯) (na linha da tabela)

![Menu de ações (⋯) (na linha da tabela)](../img/estados/financeiro-contas-a-receber--menu-de-acoes-na-linha-da-tabela.jpg)

- Itens do menu/lista: Detalhar · Editar · Excluir

### Paginação — 1 print da página 2

- lista com uma página só (botão de próxima página desabilitado), sem print

<!-- /estados -->
