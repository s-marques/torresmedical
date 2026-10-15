# Atividades

- **Módulo:** COMERCIAL / ATENDIMENTO
- **Tela:** Atividades
- **URL:** `/atividades`
- **Título na página:** Atividades

## Objetivo (inferido)

Tela "Atividades" do módulo COMERCIAL / ATENDIMENTO. Apresenta listagem em tabela com colunas Titulo, Tipo, Negocio, Data Agendamento, Status, Acoes. Possui 4 campo(s) de entrada/filtro. Texto de apoio: "Painel Atividades Atividades Tarefas, ligacoes e follow-ups Nova Atividade Total 0 Pendentes 0 Concluidas 0 Canceladas 0 Todos Todos Exportar Colunas Titulo Tipo Negocio Data Agendamento Status Acoes …"

## Screenshot

![Atividades](../img/comercial-atendimento-atividades.png)

## Campos

| Nome | Rótulo | Tipo | Obrigatório | Valores/opções |
|---|---|---|---|---|
| — | — | combobox | não indicado | — |
| — | — | combobox | não indicado | — |
| — | Buscar atividades... | text | não indicado | — |
| — | — | combobox | não indicado | — |

## Botões e ações

- Buscar... ⌘K
- Toggle theme
- Customize theme
- Notifications
- GC
- Nova Atividade
- Todos
- Exportar
- Colunas
- Titulo
- Tipo
- Negocio
- Data Agendamento
- Status
- 10
- Ir para primeira página _(desabilitado)_
- Ir para página anterior _(desabilitado)_
- Ir para próxima página _(desabilitado)_
- Ir para última página _(desabilitado)_

## Tabelas / grids

**Tabela 1** — 1 linha(s) visível(is)

- Colunas: Titulo · Tipo · Negocio · Data Agendamento · Status · Acoes
- Colunas possivelmente ordenáveis: Titulo, Tipo, Negocio, Data Agendamento, Status

- Filtros/busca: Buscar atividades...
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

### Nova Atividade

![Nova Atividade](../img/estados/comercial-atendimento-atividades--nova-atividade.jpg)

- Abre modal **Nova Atividade**

| Campo | Tipo | Obrigatório | Opções |
|---|---|---|---|
| Titulo * | text | sim | — |
| Tipo | combobox | não indicado | — |
| Negocio ID | number | não indicado | — |
| Data Agendamento | datetime-local | não indicado | — |
| Descricao | textarea | não indicado | — |

- Botões do modal: Tarefa · Cancelar · Criar Atividade · Close

### Dropdown aberto: Todos

![Dropdown aberto: Todos](../img/estados/comercial-atendimento-atividades--dropdown-aberto-todos.jpg)

- Itens do menu/lista: Todos · Ligacao · E-mail · Reuniao · Tarefa · WhatsApp · Nota

### Colunas

![Colunas](../img/estados/comercial-atendimento-atividades--colunas.jpg)

- Itens do menu/lista: Titulo · Tipo · Negocio_titulo · Data_agendamento · Status

### Ordenação por coluna — 1 print de exemplo (colunas: Titulo, Tipo, Negocio, Data Agendamento, Status)

![Ordenação por coluna — 1 print de exemplo (colunas: Titulo, Tipo, Negocio, Data Agendamento, Status)](../img/estados/comercial-atendimento-atividades--ordenacao-por-coluna-1-print-de-exemplo-colunas-ti.jpg)


### Paginação — 1 print da página 2

- lista com uma página só (botão de próxima página desabilitado), sem print

<!-- /estados -->
