# CLAUDE.md – Torres Medical

Reconstrução do sistema de gestão da clínica Torres Medical. O sistema atual está
documentado em `docs/inventario/`. São 70 telas em 9 módulos: um `.md` e um screenshot
por tela, com índice em `docs/inventario/README.md`. Cada tela tem uma issue no board.

- Repositório: `s-marques/torresmedical`
- Board: https://github.com/users/s-marques/projects/2 (projeto **2** do usuário `s-marques`)
- Equipe: `s-marques` e `mmfla12silva`. Cada dev usa o próprio Claude Code.

Este arquivo vale para os dois devs. Siga-o à risca. Quando algo aqui conflitar com o
pedido de uma issue, pare e pergunte ao dev.

---

## 1. Stack

| Camada | Tecnologia |
|---|---|
| Front-end | `apps/web`: React + Vite + TypeScript, React Router, TanStack Query, TanStack Table, React Hook Form, shadcn/ui (Tailwind) |
| Back-end | `apps/api`: NestJS + TypeScript |
| Banco | PostgreSQL + Prisma (schema e migrations em `apps/api/prisma`) |
| Mensageria | RabbitMQ (`@golevelup/nestjs-rabbitmq` ou `amqplib` encapsulado em `MessagingModule`) |
| Validação compartilhada | Zod, com schemas em `packages/shared`, usados no front e no back |
| Ambiente local | Docker Compose (postgres, rabbitmq, api, web) |
| CI | GitHub Actions: lint, typecheck, testes, build e análise Sonar |
| Qualidade | SonarQube Cloud, com Quality Gate obrigatório em todo PR |
| Gerenciador de pacotes | pnpm workspaces |

## 2. Estrutura do monorepo

```
.
├── apps/
│   ├── api/                         # NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/          # nunca editar migration já mergeada
│   │   │   └── seed.ts              # somente dados fictícios
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/              # infraestrutura transversal
│   │   │   │   ├── audit/           # AuditModule, AuditInterceptor, @Audit()
│   │   │   │   ├── auth/            # JWT, guards, @RequirePermission()
│   │   │   │   ├── context/         # contexto da requisição (usuário, requestId)
│   │   │   │   ├── errors/          # filtro global de exceções, códigos de erro
│   │   │   │   ├── messaging/       # MessagingModule, publisher, consumer base
│   │   │   │   ├── pagination/      # DTO de listagem, paginação, ordenação, filtros
│   │   │   │   ├── export/          # exportação Excel/PDF
│   │   │   │   ├── storage/         # upload de arquivos
│   │   │   │   └── prisma/          # PrismaService
│   │   │   └── modules/             # um módulo Nest por módulo do inventário
│   │   │       ├── painel/
│   │   │       ├── comercial-atendimento/
│   │   │       ├── consultorio-assistencial/
│   │   │       ├── gestao-profissionais/
│   │   │       ├── financeiro/
│   │   │       ├── patrimonio-pessoal/
│   │   │       ├── compras-estoque/
│   │   │       ├── regulatorio-qualidade/
│   │   │       └── configuracoes-gestao/
│   │   └── test/                    # testes e2e (supertest)
│   └── web/                         # React + Vite
│       └── src/
│           ├── app/                 # providers, router, layout (menu lateral)
│           ├── components/
│           │   ├── ui/              # primitivos shadcn/ui
│           │   └── shared/          # DataGrid, FormField/FormLayout, Modal, ConfirmDialog, ReportPage
│           ├── features/            # uma pasta por módulo do inventário
│           │   └── <modulo>/<tela>/ # página, hooks de dados e componentes da tela
│           ├── lib/                 # cliente HTTP, tratamento de erros, auth
│           └── hooks/
├── packages/
│   └── shared/                      # schemas Zod, tipos, enums, permissões, definição do menu
├── docs/inventario/                 # inventário do sistema atual (fonte dos requisitos)
├── docker-compose.yml
├── sonar-project.properties
├── .github/workflows/ci.yml
└── CLAUDE.md
```

Estrutura interna de um módulo Nest:

```
modules/financeiro/
├── financeiro.module.ts
├── contas-receber/
│   ├── contas-receber.controller.ts
│   ├── contas-receber.service.ts
│   ├── contas-receber.repository.ts   # opcional: acesso Prisma isolado
│   ├── dto/                            # re-exporta/usa schemas de packages/shared
│   └── contas-receber.service.spec.ts
└── contas-pagar/ ...
```

## 3. Padrões

### Nomenclatura
- **Pastas e arquivos:** `kebab-case` (`contas-receber.service.ts`, `DataGrid.tsx` para componentes React).
- **Classes, componentes e tipos:** `PascalCase`. **Variáveis e funções:** `camelCase`. **Constantes:** `UPPER_SNAKE_CASE`.
- **Domínio em português,** sem acento, alinhado ao inventário: `Paciente`, `ContaReceber`, `Agendamento`.
  Termos técnicos ficam em inglês (`controller`, `service`, `repository`, `dto`).
- **Prisma:** model em `PascalCase` singular (`ContaReceber`) e tabela em `snake_case` plural via
  `@@map("contas_receber")`. Colunas em `snake_case` via `@map`.
- **API REST:** `/api/<modulo>/<recurso>` no plural e em kebab-case, por exemplo `/api/financeiro/contas-receber`.
- **Rotas do front:** use as mesmas URLs do sistema atual, listadas em `docs/inventario/README.md`.
- **Permissões:** `<modulo>.<recurso>.<acao>`, por exemplo `financeiro.contas-receber.criar`. O catálogo fica em `packages/shared`.
- **Branches:** `feature/<numero>-<descricao-curta>`, `fix/<numero>-<descricao>`, `docs/<descricao>`.
- **Commits:** Conventional Commits em português, por exemplo `feat(financeiro): lista de contas a receber (#34)`.

### Um módulo Nest por módulo do inventário
- Cada um dos 9 módulos do inventário corresponde a um módulo Nest em `apps/api/src/modules/<modulo>`.
  As telas viram sub-pastas (controller e service por recurso) dentro dele.
- Um módulo não acessa as tabelas de outro diretamente. Ele usa o service exportado pelo outro
  módulo (chamada direta) ou um evento (fila). Veja a seção 5.
- Entidades compartilhadas (Paciente, Profissional, Fornecedor, Produto, Unidade, Funcionário)
  pertencem ao módulo dono e são expostas por service exportado.

### Componentes React reutilizáveis (obrigatório usar)
Não crie grid, formulário ou modal do zero numa tela. Use os componentes de `components/shared`.
Se faltar algo, evolua o componente compartilhado no mesmo PR, com teste.

- **`DataGrid`:** o padrão de grid do inventário. Inclui busca textual, filtros rápidos por status
  em chips (Todos/Ativo/Inativo…), filtros extras (selects e período), botão **Colunas**
  (mostrar e ocultar), ordenação por coluna, paginação no servidor (primeira, anterior, próxima,
  última, tamanho da página), **Exportar** (Excel/PDF), coluna de ações por linha e estado vazio.
  Ele consome o contrato de listagem da API (seção 3, "API").
- **`Form`** (`FormLayout` + `FormField`): React Hook Form + `zodResolver` com o schema de
  `packages/shared`. Exibe rótulo, marcação de obrigatório, mensagem de erro por campo e erro geral do servidor.
- **`Modal`** e **`ConfirmDialog`:** toda ação destrutiva (excluir, cancelar, desativar) passa por `ConfirmDialog`.
- **`ReportPage`:** a página padrão de Relatórios (seletor de relatório, período De/Até e exportação),
  usada pelas 7 telas de Relatórios.
- **`PageHeader`:** título, descrição e ações principais da tela ("Novo …", "Exportar").

### API
- **Listagens** recebem `?page=1&pageSize=10&sort=campo:asc&search=texto&status=...&<filtros>`
  e retornam `{ data: T[], meta: { page, pageSize, total, totalPages } }`.
- **Escrita:** `POST` cria, `PATCH /:id` altera, `DELETE /:id` exclui. Use exclusão lógica
  (`deletedAt`) para entidades com histórico clínico ou financeiro.
- **Controllers** são finos. A regra de negócio fica no service.
- **Todos os endpoints** são documentados com `@nestjs/swagger`.

### Tratamento de erros
- **Back:** um filtro global de exceções converte tudo para o formato abaixo.
  ```json
  { "statusCode": 400, "code": "VALIDATION_ERROR", "message": "Dados inválidos", "details": [{ "field": "cpf", "message": "CPF inválido" }], "requestId": "..." }
  ```
  - Erros de negócio usam `BusinessException(code, message)`, com código estável em `UPPER_SNAKE_CASE`.
  - Erros do Prisma são mapeados: `P2002` vira 409 `DUPLICATE`, `P2025` vira 404 `NOT_FOUND`.
  - Um erro 500 nunca expõe stack, SQL ou dados ao cliente. O detalhe vai só para o log, sem dados pessoais.
- **Front:** o cliente HTTP (`lib/api`) trata os erros de forma centralizada.
  - 401 redireciona para o login. 403 mostra a mensagem "Sem permissão".
  - 400 mapeia `details` para os campos do formulário. Os demais erros aparecem em toast.
  - Cada página tem um error boundary com estado de erro amigável.

### Validação (front e back)
- **Fonte única:** schema Zod em `packages/shared/src/schemas/<modulo>/<recurso>.ts`.
- **Front:** `zodResolver` no React Hook Form valida campo a campo antes de enviar.
- **Back:** o mesmo schema via `ZodValidationPipe`. O back sempre valida, nunca confia no front.
- **Regras que dependem do banco** (unicidade, saldo, status permitido) ficam no service e retornam `BusinessException`.
- **Mensagens de validação** em português, iguais ou equivalentes às do inventário.

## 4. Auditoria (obrigatória em todo módulo)

Toda **criação, alteração e exclusão** grava um registro em `audit_log`. Nenhum PR que crie
endpoint de escrita é aprovado sem auditoria e sem o teste que a comprova.

Tabela `audit_log`:

| Coluna | Conteúdo |
|---|---|
| `id` | uuid |
| `user_id` | usuário autenticado (do contexto da requisição) |
| `occurred_at` | data/hora (timestamptz, UTC) |
| `action` | `CREATE` \| `UPDATE` \| `DELETE` |
| `entity` | nome da entidade (ex.: `ContaReceber`) |
| `entity_id` | id do registro |
| `before` | jsonb: valores antes (null em CREATE) |
| `after` | jsonb: valores depois (null em DELETE) |
| `request_id`, `ip` | rastreabilidade |

Como usar:
- O `AuditInterceptor` é global. Cada endpoint de escrita é decorado com `@Audit({ entity: 'ContaReceber' })`.
- Em `UPDATE`/`DELETE`, o interceptor carrega o estado anterior pelo `:id` antes do handler.
  O handler deve retornar a entidade resultante, que vira o `after`.
- Campos sensíveis de autenticação (`password`, `passwordHash`, `token`, `secret`) são removidos
  de `before`/`after` pelo interceptor.
- A tabela `audit_log` só aceita inserção: não há endpoint de alteração ou exclusão.
  A leitura é restrita ao perfil administrador.
- Operações em lote ou disparadas por consumidor de fila (sem request HTTP) usam
  `AuditService.record(...)` diretamente, com o usuário do evento ou `system`.
- **Teste obrigatório:** o e2e de cada endpoint de escrita verifica o registro gravado em `audit_log`.

## 5. Mensageria (RabbitMQ)

**Use fila quando:**
- A ação chama um sistema externo: WhatsApp, e-mail, NFSe/NFe, provedores de IA.
- O processamento é demorado ou pesado: importação de XML/OFX/CSV, indexação da base de
  conhecimento, relatórios grandes, análises do AI Growth, envio de campanhas.
- Outro módulo precisa reagir a um fato, mas o usuário não precisa esperar.
  Exemplo: venda paga gera título no financeiro e baixa de estoque.
- A ação precisa de retry automático.

**Use chamada direta (service exportado) quando:**
- O usuário precisa da resposta na mesma requisição (consultas, validações, cálculo de preço/saldo).
- A consistência precisa ser imediata e transacional dentro do mesmo banco.
- É uma leitura de dados de outro módulo.

**Padrão de nomes:**
- **Exchange:** um por módulo publicador, do tipo `topic`. Formato `torres.<modulo>`, por exemplo `torres.comercial`.
- **Evento** (routing key, fato ocorrido, no passado): `<modulo>.<entidade>.<acao-no-passado>`.
  Exemplos: `comercial.venda.paga`, `comercial.agendamento.criado`, `compras.compra.recebida`.
- **Comando** (pedido de ação, no imperativo): `<modulo>.<entidade>.<acao>`, publicado no exchange do módulo destino.
  Exemplos: `regulatorio.nfse.emitir`, `comercial.whatsapp.enviar-mensagem`.
- **Fila:** `<modulo-consumidor>.<proposito>`, por exemplo `financeiro.gerar-titulo-venda`.
  A dead-letter queue é `<fila>.dlq`.
- **Envelope da mensagem:** `{ eventId (uuid), type, occurredAt, userId, payload, version }`.

**Regras:**
- Consumidores são **idempotentes** (deduplicam por `eventId`), têm retry com backoff e mandam
  para a DLQ após N falhas.
- O payload leva **ids**, não dados pessoais. Exemplo: `{ pacienteId }`, nunca nome, CPF ou telefone.
  O consumidor busca o que precisar.
- Publique o evento só depois do commit da transação.

## 6. Segurança e LGPD

O sistema trata **dados de saúde**, que são dados pessoais sensíveis pela LGPD.

- **Nunca logar dados pessoais:** nome, CPF, RG, telefone, e-mail, endereço, dados clínicos
  (prontuário, evolução, receita), dados financeiros de pessoas e conteúdo de mensagens.
  Logue ids e `requestId`. Configure redaction no logger (pino) para esses campos.
- **Controle de acesso por perfil:**
  - Todo endpoint é protegido por padrão (guard global). Rotas públicas exigem `@Public()` explícito.
  - Toda ação exige `@RequirePermission('<modulo>.<recurso>.<acao>')`.
  - O front esconde menus e botões sem permissão, mas **quem garante é o back**.
- **Segredos:** nunca commitar `.env`, tokens, `auth.json`, chaves, certificados (A1 de NF) ou
  dumps de banco. Use `.env.example` sem valores reais. O `.gitignore` já deve cobrir isso.
  Se um segredo for commitado, avise o dev imediatamente: ele precisa ser revogado.
- **Dados de teste e seed:** use apenas dados fictícios (faker). Nunca copie nomes, CPFs ou
  telefones dos screenshots do inventário para código, testes, seeds ou issues.
- **Senhas** com hash (argon2 ou bcrypt). Comunicação em HTTPS.
- **Exportações** (Excel/PDF) respeitam permissão e também são auditadas, com uma ação
  `EXPORT` registrada no `audit_log`.

## 7. Testes (obrigatórios em cada issue)

| O quê | Tipo | Ferramenta |
|---|---|---|
| Regras de negócio e validações do service | unitário | Jest (api) |
| Cada endpoint: sucesso, validação (400), sem permissão (403), não encontrado (404) | e2e | Jest + supertest + Postgres de teste |
| Cada endpoint de escrita grava `audit_log` correto (before/after) | e2e | idem |
| Consumidores de fila: processamento e idempotência | unitário | Jest |
| Formulário: validações e mensagens dos campos obrigatórios | componente | Vitest + Testing Library |
| Grid: colunas, filtros, ordenação e paginação chamando a API corretamente | componente | Vitest + Testing Library + MSW |
| Componentes compartilhados alterados | componente | Vitest |

- Os critérios de aceite da issue precisam ter teste correspondente sempre que for testável.
- A cobertura de código novo precisa ser de pelo menos 80%, conforme o Quality Gate do Sonar.
- Rode localmente antes do PR: `pnpm lint && pnpm typecheck && pnpm test`.

## 8. Qualidade (CI + SonarQube Cloud)

Antes de mover o card para **"Em revisão"**:

1. Abra o PR e aguarde o CI e a análise do Sonar.
2. Verifique os checks:
   ```bash
   gh pr checks <numero-do-pr> --watch
   ```
3. Se o **CI** ou o **Quality Gate do Sonar** falhar, leia os problemas apontados:
   - CI: `gh run view --log-failed`
   - Sonar: o comentário do Sonar no PR ou o painel do SonarQube Cloud
4. **Corrija tudo, faça push e verifique de novo.** Não mova o card nem faça merge com check vermelho.
   Não desative regras do Sonar nem marque issues como "won't fix" sem o dev aprovar.

## 9. Como implementar uma tela

1. Leia a issue e os **critérios de aceite**.
2. Leia `docs/inventario/telas/<arquivo>.md` (o link está na issue) e veja o screenshot em
   `docs/inventario/img/<arquivo>.png`.
3. Implemente todos os **campos, ações, validações, grids** (colunas, filtros, ordenação e
   paginação) e abas descritos.
   - O inventário foi gerado automaticamente e só em modo leitura. Modais e formulários de
     "Novo…/Editar" não foram abertos.
   - Quando faltar um detalhe, por exemplo os campos de um formulário de criação, deduza pela
     coluna do grid e pela tela de detalhe. **Pergunte ao dev em caso de dúvida.**
   - Registre na descrição do PR o que foi deduzido.
4. Siga a ordem:
   1. Schema Zod em `packages/shared`
   2. Model e migration Prisma
   3. Service e controller com `@Audit` e `@RequirePermission`
   4. Testes da API
   5. Página em `features/<modulo>/<tela>` usando `DataGrid`, `Form` e `Modal`
   6. Rota e item de menu com permissão
   7. Testes do front
5. Marque no PR cada critério de aceite atendido.

## 10. Migrations (Prisma)

- **Antes de abrir o PR,** atualize a branch com a `main`:
  ```bash
  git fetch origin main && git rebase origin/main
  ```
- **Se houver migration nova na `main`** que não estava na sua branch, recrie a sua por cima dela:
  1. Apague a pasta da **sua** migration (só a sua, nunca as que vieram da main).
  2. Rode `pnpm --filter api prisma migrate dev --name <descricao>` para gerar de novo sobre a main.
  3. Confira o SQL gerado e rode os testes.
- **Nunca edite uma migration já mergeada na `main`.** Para corrigir, crie uma migration nova.
- **Uma migration por PR,** sempre que possível, com nome descritivo
  (`20261014_criar_contas_receber`).
- **Nunca use** `prisma migrate reset` nem `db push` contra banco que não seja local.

## 11. Fluxo do board

Board: projeto 2 de `s-marques`. Campo **Status:** Backlog → Pronto para desenvolvimento →
Em desenvolvimento → Em revisão → Concluído.

IDs para mover cards via `gh`:

| Item | ID |
|---|---|
| Projeto | `PVT_kwHOAGOncM4BnBMG` |
| Campo Status | `PVTSSF_lAHOAGOncM4BnBMGzhlnt3M` |
| Backlog | `d6ef4bd2` |
| Pronto para desenvolvimento | `fa674d77` |
| Em desenvolvimento | `48b83db6` |
| Em revisão | `dad075aa` |
| Concluído | `a17f10d9` |

```bash
# id do item do board a partir do número da issue
gh project item-list 2 --owner s-marques --limit 500 --format json \
  | jq -r '.items[] | select(.content.number==<N>) | .id'
# mover o card
gh project item-edit --project-id PVT_kwHOAGOncM4BnBMG --id <ITEM_ID> \
  --field-id PVTSSF_lAHOAGOncM4BnBMGzhlnt3M --single-select-option-id <OPCAO>
```

### Regras
1. **Só pegue cards em "Pronto para desenvolvimento".**
2. **Pegue apenas cards sem responsável** e cujas **dependências estejam em "Concluído"**.
   - Issues de base (label `base`) listam as dependências na seção "Dependências".
   - Issues de tela trazem um comentário "Dependências" listando as issues de base necessárias.
   - Verifique o status de cada dependência no board, não só se a issue está fechada.
3. **Ao pegar um card:**
   1. Atribua ao dev que está usando você: `gh issue edit <N> --add-assignee @me`.
   2. Confira de novo os responsáveis (`gh issue view <N> --json assignees`). Se o outro dev
      também estiver atribuído, porque pegou ao mesmo tempo, remova-se
      (`--remove-assignee @me`) e escolha outro card.
   3. Mova o card para **"Em desenvolvimento"**.
   4. **Só então comece.**
4. **Uma branch por issue,** a partir da `main` atualizada: `feature/<numero>-<descricao>`,
   por exemplo `feature/34-contas-a-receber`.
5. **Ao terminar:**
   1. Atualize com a main e trate as migrations (seção 10).
   2. Abra o PR com `Closes #<N>` na descrição.
   3. Verifique CI e Sonar (seção 8).
   4. Mova o card para **"Em revisão"**.
6. **Revisão e merge:** o próprio dev revisa o PR e faz o merge (squash), **somente se o
   Quality Gate do Sonar e o CI passarem**. Depois do merge, confirme que a issue fechou e
   mova o card para **"Concluído"**. Apague a branch.
7. **Nunca faça merge nem push direto na `main` sem PR.**
8. Cards de tela começam em **Backlog**. Um dev move uma tela para "Pronto para
   desenvolvimento" quando todas as dependências de base dela estiverem em "Concluído".
9. Não mexa em cards atribuídos ao outro dev.
