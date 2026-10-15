# Plano de Contas

- **Módulo:** FINANCEIRO
- **Tela:** Plano de Contas
- **URL:** `/plano-contas`
- **Título na página:** Plano de Contas

## Objetivo (inferido)

Tela "Plano de Contas" do módulo FINANCEIRO. Apresenta listagem em tabela com colunas Código, Nome, Tipo, Nível, Ativo, Ações. Possui 2 campo(s) de entrada/filtro. Texto de apoio: "Plano de Contas Estrutura hierárquica de contas contábeis Imprimir Nova Conta Buscar Tipo Todos Expandir Tudo Recolher 212 contas Código Nome Tipo Nível Ativo Ações 1 ATIVO Ativo 1 1.1 ATIVO CIRCULANT…"

## Screenshot

![Plano de Contas](../img/financeiro-plano-de-contas.png)

## Campos

| Nome | Rótulo | Tipo | Obrigatório | Valores/opções |
|---|---|---|---|---|
| — | Buscar | text | não indicado | — |
| — | Tipo | combobox | não indicado | — |

## Botões e ações

- Buscar... ⌘K
- Toggle theme
- Customize theme
- Notifications
- GC
- Imprimir
- Nova Conta
- Todos
- Expandir Tudo
- Recolher
- (ícone sem rótulo)

## Tabelas / grids

**Tabela 1** — 212 linha(s) visível(is)

- Colunas: Código · Nome · Tipo · Nível · Ativo · Ações
- Colunas possivelmente ordenáveis: não identificado

- Filtros/busca: Buscar, Tipo
- Paginação: não identificada

## Abas

_Nenhuma aba._

## Modais

_Nenhum modal aberto na carga da tela. Modais disparados por botões não foram abertos (regra somente-leitura)._

## Links para outras telas

_Nenhum link na área principal._

## Mensagens e validações visíveis

_Nenhuma mensagem visível._

<!-- estados -->
## Estados capturados (interações de visualização)

_Capturados em 15/10/2026 clicando só em itens de visualização do checklist da issue. Nenhum formulário foi preenchido e toda gravação foi bloqueada._

### Nova Conta

![Nova Conta](../img/estados/financeiro-plano-de-contas--nova-conta.jpg)

- Abre modal **Nova Conta**

| Campo | Tipo | Obrigatório | Opções |
|---|---|---|---|
| Código * | text | sim | — |
| Tipo * | combobox | sim | — |
| Nome * | text | sim | — |
| Conta Pai | combobox | não indicado | — |

- Botões do modal: Despesa · Nenhuma (raiz) · Cancelar · Salvar · Close

### Dropdown aberto: Todos

![Dropdown aberto: Todos](../img/estados/financeiro-plano-de-contas--dropdown-aberto-todos.jpg)

- Itens do menu/lista: Todos · Receita · Despesa · Ativo · Passivo

### Expandir Tudo

![Expandir Tudo](../img/estados/financeiro-plano-de-contas--expandir-tudo.jpg)


### Recolher

![Recolher](../img/estados/financeiro-plano-de-contas--recolher.jpg)


### Expandir (ícone ▾) (na linha da tabela)

![Expandir (ícone ▾) (na linha da tabela)](../img/estados/financeiro-plano-de-contas--expandir-icone-na-linha-da-tabela.jpg)


### Editar (ícone lápis) (na linha da tabela)

![Editar (ícone lápis) (na linha da tabela)](../img/estados/financeiro-plano-de-contas--editar-icone-lapis-na-linha-da-tabela.jpg)

- Abre modal **Editar Conta**

| Campo | Tipo | Obrigatório | Opções |
|---|---|---|---|
| Código * | text | sim | — |
| Tipo * | combobox | sim | — |
| Nome * | text | sim | — |
| Conta Pai | combobox | não indicado | — |

- Botões do modal: Ativo · Nenhuma (raiz) · Cancelar · Salvar · Close

<!-- /estados -->
