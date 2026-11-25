# Torres Medical

[![Quality gate status](https://sonarcloud.io/api/project_badges/measure?project=s-marques_torresmedical&metric=alert_status&token=217b73ab738358867f75a9ed7d744aa2f9612581)](https://sonarcloud.io/summary/new_code?id=s-marques_torresmedical)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=s-marques_torresmedical&metric=coverage&token=217b73ab738358867f75a9ed7d744aa2f9612581)](https://sonarcloud.io/summary/new_code?id=s-marques_torresmedical)

Reconstrução do sistema de gestão da clínica Torres Medical. Padrões, fluxo de trabalho e
regras do projeto estão no [`CLAUDE.md`](CLAUDE.md). O inventário do sistema atual fica em
[`docs/inventario/`](docs/inventario/README.md).

## Estrutura

| Pacote            | Conteúdo                                              |
| ----------------- | ----------------------------------------------------- |
| `apps/api`        | NestJS (`@torres/api`)                                |
| `apps/web`        | React + Vite (`@torres/web`)                          |
| `packages/shared` | Schemas Zod e tipos compartilhados (`@torres/shared`) |

## Requisitos

- Docker com Docker Compose
- Para rodar fora do Docker: Node 22 (>= 22.12) e pnpm via corepack (`corepack enable`)

## Ambiente com Docker

```bash
cp .env.example .env   # troque as senhas
docker compose up -d --build
```

| Serviço    | Acesso                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| `web`      | `http://<host>:5173` (publicado em `0.0.0.0`)                                       |
| `api`      | só pela rede interna; o front acessa por `/api` (proxy do Vite → `http://api:3000`) |
| `postgres` | só pela rede interna (debug: descomente `127.0.0.1:5433:5432` no compose)           |
| `rabbitmq` | AMQP só pela rede interna; painel em `http://127.0.0.1:15672` (use túnel SSH)       |
| `minio`    | S3 só pela rede interna; console em `http://127.0.0.1:9001` (use túnel SSH)         |

Health da API: `http://<host>:5173/api/health`.

O código é montado como volume: API (`nest start --watch`), web (Vite HMR) e shared
(`tsup --watch`) recarregam sozinhos. Os `node_modules` ficam em volumes do container.
Depois de mudar dependências, rode `docker compose up -d --build -V`.

### Ambientes no servidor

| Ambiente            | Porta  | Código                                                   | Atualização                       |
| ------------------- | ------ | -------------------------------------------------------- | --------------------------------- |
| **Homologação**     | `5173` | sempre a `main` (`~/projetos/torresmedical-homologacao`) | automática a cada merge na `main` |
| **Desenvolvimento** | `5174` | a branch aberta em `~/projetos/torresmedical-dev`        | hot reload (como acima)           |

Fluxo: com o card em **Em revisão**, teste a branch no desenvolvimento (`5174`); depois do merge,
a homologação (`5173`) se atualiza sozinha.

- A homologação usa o Postgres, o RabbitMQ e o MinIO do desenvolvimento, com banco
  `torres_homologacao`, vhost `homologacao` e bucket `torres-arquivos-homologacao` próprios.
- O workflow [`homologacao.yml`](.github/workflows/homologacao.yml) roda a cada push na `main` e
  executa por SSH o `atualizar.sh` do servidor: `pull` da `main`, rebuild da imagem quando as
  dependências mudam, recriação de `api`/`web` do zero (migrations aplicadas na subida) e espera
  pelo healthcheck. O log fica no Actions e em `torresmedical-homologacao/atualizar.log`. Para
  rodar de novo sem merge: Actions → Homologação → _Run workflow_.
- Secrets usados: `HOMOLOGACAO_SSH_KEY` (chave que só executa o script), `HOMOLOGACAO_SSH_HOST`,
  `HOMOLOGACAO_SSH_USER` e `HOMOLOGACAO_SSH_KNOWN_HOSTS`.
- O cookie de sessão vale para o host, sem distinguir porta: logado nos dois ambientes no mesmo
  navegador, um encerra a sessão do outro ao recarregar. Use perfis ou navegadores diferentes.

### Variáveis de ambiente (`.env`)

O `.env` nunca é commitado. O [`.env.example`](.env.example) lista as variáveis sem valores reais:

| Variável                                            | Uso                                                 |
| --------------------------------------------------- | --------------------------------------------------- |
| `WEB_PORT`                                          | Porta externa do front (padrão 5173)                |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciais do PostgreSQL                           |
| `DATABASE_URL`                                      | Conexão da API com o PostgreSQL (host `postgres`)   |
| `DATABASE_URL_TEST`                                 | Banco dos testes (nome termina com `_test`)         |
| `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`    | Credenciais do RabbitMQ                             |
| `RABBITMQ_URL`                                      | Conexão da API com o RabbitMQ (host `rabbitmq`)     |
| `RABBITMQ_URL_TEST`                                 | RabbitMQ dos testes (opcional)                      |
| `MESSAGING_*`                                       | Retry, prefetch e outbox (ver `.env.example`)       |
| `CAMPANHAS_AGENDADOR`                               | `off` desliga o agendador de campanhas              |
| `API_PORT`                                          | Porta interna da API (padrão 3000)                  |
| `LOG_LEVEL`                                         | Nível do log da API (`info`, `debug`…)              |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`            | Credenciais do MinIO                                |
| `STORAGE_DRIVER`                                    | `s3` (MinIO, no Docker) ou `local` (disco)          |
| `STORAGE_S3_*`                                      | Endpoint, bucket e chaves do S3/MinIO               |
| `STORAGE_S3_BUCKET_TEST`                            | Bucket dos testes (nome termina com `-test`)        |
| `STORAGE_LOCAL_DIR`                                 | Pasta do driver `local` (padrão `storage`)          |
| `STORAGE_URL_SECRET`                                | Segredo das URLs temporárias de download            |
| `STORAGE_URL_TTL_SECONDS`                           | Validade dessas URLs (padrão 300)                   |
| `BACKUP_*`                                          | Backup e restauração (seção "Backup e restauração") |

## Banco de dados (Prisma)

Schema, migrations e seed ficam em `apps/api/prisma`. O client gerado vai para
`apps/api/src/generated/prisma` (fora do git). Ao subir, o container da API gera o client e
aplica as migrations pendentes (`prisma migrate deploy`).

O Postgres só é acessível pela rede interna, então os comandos rodam dentro do container:

```bash
docker compose exec api pnpm --filter api prisma migrate dev --name <descricao>  # nova migration
docker compose exec api pnpm --filter @torres/api db:seed                        # dados fictícios
```

| Script (`apps/api`) | Uso                                                         |
| ------------------- | ----------------------------------------------------------- |
| `db:generate`       | Gera o client do Prisma (os scripts da raiz já rodam antes) |
| `db:migrate`        | `prisma migrate dev`: cria e aplica migrations (só local)   |
| `db:deploy`         | `prisma migrate deploy`: aplica as migrations pendentes     |
| `db:seed`           | Grava os dados fictícios do seed (idempotente)              |
| `db:studio`         | Prisma Studio                                               |

O seed usa somente dados gerados pelo faker (semente fixa) e e-mails `@example.com`. Nunca
copie nomes, CPFs ou telefones do inventário.

**Prisma Studio:** ele escuta só no `localhost` de onde roda. Descomente a porta de debug do
Postgres (`127.0.0.1:5433:5432`) no compose e rode no host, apontando para ela:

```bash
DATABASE_URL=postgresql://<usuario>:<senha>@127.0.0.1:5433/<banco> pnpm --filter @torres/api db:studio
```

### Testes com banco

Os e2e apagam dados, por isso só rodam em banco cujo nome termina com `_test`
(`DATABASE_URL_TEST`; no CI, `DATABASE_URL`). Prepare o banco de teste e rode os testes no container:

```bash
docker compose exec api sh -c 'DATABASE_URL=$DATABASE_URL_TEST pnpm --filter @torres/api db:deploy'
docker compose exec api pnpm test
```

## Front-end (`apps/web`)

- **Menu e rotas:** definidos em `packages/shared/src/menu/menu.ts` (ordem e nomes de
  `docs/inventario/README.md`). Cada URL abre o placeholder "Em construção" até a tela ser
  registrada em `apps/web/src/app/paginas.ts`.
- **Cliente HTTP:** `apiFetch` (`src/lib/api/client.ts`), com o tratamento de erros
  centralizado no QueryClient (`src/lib/api/query-client.ts`).
- **Primitivos shadcn/ui:** em `src/components/ui`, gerados pelo CLI e fora da análise do Sonar.
  Para adicionar um primitivo:

  ```bash
  cd apps/web && npx shadcn@4.21.0 add <componente>
  ```

  Depois, confira o `package.json`. O CLI pode adicionar dependências sem versão exata ou
  pacotes indevidos, como `cn` e `next-themes` (o tema vem de `@/lib/theme`). Também pode
  gerar `import { cn } from "cn"`, que deve ser trocado por `@/lib/utils`.

## Componentes compartilhados (`apps/web/src/components/shared`)

As telas usam estes componentes em vez de criar grid, formulário ou modal do zero (CLAUDE.md,
seção 3). Exemplos funcionando em **`/dev/componentes`**: a página existe só em desenvolvimento
(`import.meta.env.DEV`) e não aparece no menu. O código dela fica em `src/app/pages/exemplos/`.

- **`PageHeader`:** breadcrumb "Painel > Tela", título, descrição e ações (`acoes`).
- **`DataGrid`** (`data-grid/DataGrid`): consome o contrato de listagem `{ data, meta }`.
  ```tsx
  const COLUNAS: ColunaGrid<Unidade>[] = [
    { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true },
    {
      id: 'status',
      titulo: 'Status',
      ordenavel: 'ativo',
      exportavel: true,
      celula: (u) => <StatusAtivo ativo={u.ativo} />,
    },
  ];
  <DataGrid
    url="/api/configuracoes-gestao/unidades"
    schema={unidadePageSchema} // paginatedResponseSchema(item)
    querySchema={listUnidadesQuerySchema} // listQuerySchema: descarta parâmetros inválidos da URL
    colunas={COLUNAS}
    busca="Buscar unidades..."
    status={{
      opcoes: [
        { valor: 'ativo', rotulo: 'Ativo' },
        { valor: 'inativo', rotulo: 'Inativo' },
      ],
    }}
    filtros={[
      {
        tipo: 'periodo',
        rotulo: 'Vencimento',
        parametroDe: 'vencimentoDe',
        parametroAte: 'vencimentoAte',
      },
    ]}
    exportacao={{
      permissao: 'configuracoes-gestao.minha-empresa.exportar',
      schema: exportUnidadesQuerySchema,
    }}
    acoes={(u) => [
      {
        rotulo: 'Excluir',
        destrutiva: true,
        permissao: '…excluir',
        onSelect: () => setExcluindo(u),
      },
    ]}
    mensagemVazio="Nenhuma unidade encontrada."
  />;
  ```
  - O estado (página, tamanho, `sort=campo:asc`, `search`, chips e filtros) fica na query string.
    Busca e filtros voltam para a página 1. Os valores padrão não aparecem na URL.
  - Defina `colunas` fora do componente (ou com `useMemo`). `ordenavel` e `exportavel` aceitam o
    nome do campo da API, quando ele for diferente do `id` da coluna (ex.: `status` → `ativo`).
  - **Exportar** (Excel/PDF) envia os filtros, a ordenação e as colunas visíveis exportáveis
    (`columns=`) para `<url>/export`, e só aparece com a permissão. Para botões "Excel"/"PDF" no
    `PageHeader`, use `useExportacao`.
  - Opções de "Linhas por página": 10, 20, 30, 40 e 50 (`tamanhosPagina` muda por tela).
- **`FormLayout` + `FormField`** (`form/`): React Hook Form com `zodResolver` e o schema de
  `@torres/shared`.
  ```tsx
  const form = useFormulario(createUnidadeSchema, { defaultValues: { nome: '', ativo: true } });
  const salvar = useMutation({ mutationFn: criarUnidade, meta: META_FORMULARIO });
  <FormLayout form={form} onSubmit={salvar.mutateAsync} onCancelar={fechar} colunas={2}>
    <FormField name="nome" label="Nome" obrigatorio />
    <FormField name="cpf" label="CPF" tipo="cpf" />
    <FormField name="pacienteId" label="Paciente" tipo="entidade" entidade="pacientes" />
  </FormLayout>;
  ```
  - Tipos: `texto`, `email`, `senha`, `numero`, `moeda`, `data`, `periodo` (`name` + `nameAte`),
    `select` (`opcoes`), `entidade` (o `EntitySelect`), `checkbox`, `switch`, `textarea` e as
    máscaras `cpf`, `cnpj`, `cpf-cnpj`, `telefone` e `cep`.
  - **Valores:** as máscaras guardam só os dígitos, `moeda` e `numero` guardam `number` (`null`
    vazio), `data` guarda `AAAA-MM-DD`, `entidade` guarda o id (`null` vazio).
  - **Erros do servidor:** o 400 com `details` vai para os campos. Os demais (409, 422, 500…)
    aparecem no topo do formulário. Com `meta: META_FORMULARIO` na mutation, o tratamento global só
    cuida de 401 (login) e 403 ("Sem permissão"), sem repetir o erro em toast.
  - No `Modal`, passe `acoes={null}` e `id` ao `FormLayout` e use
    `<FormAcoes form={form} formId={id} />` no `rodape`.
- **`Modal`** e **`ConfirmDialog`:** controlados por `aberto`/`onAbertoChange`. Devolvem o foco a
  quem abriu. Toda ação destrutiva passa pelo `ConfirmDialog`: se `onConfirmar` devolver uma
  Promise, o diálogo mostra carregamento e só fecha quando ela termina.
- **`StatusBadge`** (tons `sucesso`, `perigo`, `alerta`, `info`, `destaque`, `neutro`),
  **`StatusAtivo`** e **`EmptyState`**.
- **Toasts:** `toast.success(...)`/`toast.error(...)` do `sonner` (o `<Toaster>` já está montado).
- **Testes de grid** usam MSW: `usarMsw()` e `servidorMsw.use(http.get('/api/...', …))`
  (`src/test/msw.ts`). Não misture com `apiFalsa`/`renderApp` no mesmo arquivo.

## Agenda matricial (`/agenda?modo=matriz`)

Visão **Matriz** da Agenda (issue #137): Sala × Dia × Horário × Profissional, só leitura. Junta o
período contratado (contratos de sala), os agendamentos e os bloqueios e reservas da sala.

- **API:** `GET /api/comercial-atendimento/agenda-matriz?visao=dia|semana|mes&data=&profissionalId=&especialidadeId=&salaId=&turno=&situacao=`
  (permissão `comercial-atendimento.agenda.ver`). Dia: colunas de 1 h (07h às 20h, ampliando para
  caber o que houver fora). Semana e mês: colunas por turno (manhã até 12h, tarde das 12h às 18h,
  noite depois das 18h).
- **Estado da célula** (do mais forte ao mais fraco): manutenção, bloqueio, reserva, uso avulso,
  cortesia, agendado, contratado, disponível. Contratado sem nenhum agendamento na sala vem com
  `semUso` e aparece destacado. Agendamento cancelado libera o horário.
- **Filtros** (todos na URL): profissional, especialidade, sala, turno, visão/data e situação
  (contratado, sem uso, disponível, agendado, reservado, bloqueado). Profissional e especialidade
  escondem o que é de outros; o "disponível" vem sempre da sala inteira.
- **Escopo (#153):** usuário restrito vê só as salas com contrato, reserva ou agendamento de um
  profissional seu; o que é de outros vem `oculto`, sem nome nem valor.

## Ocupação efetiva (Painel, aba Ocupação)

Mede capacidade, contratado, utilizado e vago por sala, dia, turno e profissional (issue #139).
`GET /api/painel/dashboard/ocupacao` aceita, além do período, `salaId`, `profissionalId`, `turno`
(`MANHA`, `TARDE`, `NOITE`) e `diaSemana` (0 = domingo a 6 = sábado). Todos ficam na URL da tela.

- **Período** é a célula Sala × Dia × Turno (turnos da Agenda matricial, #137).
- **Capacidade:** períodos das salas nos dias de funcionamento (Minha Empresa > Horários; sem horário
  cadastrado, vale a semana toda), sem os bloqueados (bloqueio e manutenção).
- **Contratado:** contrato ativo e vigente cobre o turno. **Utilizado:** agendamento `ATENDIDO` ou
  `EM_ATENDIMENTO` na sala. Agendado, confirmado, faltou e cancelado não contam.
- **Contratado sem uso:** contratado e sem atendimento realizado.
- **Vago:** capacidade menos ocupados (contratado, utilizado ou reservado: reserva, cortesia e uso
  avulso). Vem sempre da sala inteira, mesmo com filtro de profissional.
- **Taxa de uso** = utilizados ÷ capacidade. **Taxa de contratação** = contratados ÷ capacidade.
  Por profissional, "uso do contratado" = períodos contratados em que ele atendeu ÷ contratados
  (0% com contrato e sem atendimento; sem contrato, "—").
- **Comparação** com o mês anterior (ou a janela anterior de mesmo tamanho, em "Por período") no
  detalhe dos indicadores. **Previsão de uso:** projeção linear (a taxa até hoje mantida até o fim);
  período encerrado mostra o realizado e período futuro, "—".
- **Horários de maior demanda:** agendamentos não cancelados por hora do dia.
- Todas as salas e profissionais ativos aparecem, inclusive os sem uso.
- **Escopo (#153):** usuário restrito vê só as salas com contrato, reserva ou agendamento de um
  profissional seu e só os profissionais do vínculo; filtrar por profissional de fora dá 403.
- A consulta usa services exportados (`AgendaOcupacaoService`, salas, contratos, bloqueios e
  `MinhaEmpresaService`). Os KPIs Taxa de Ocupação e Vacância das telas Executivo e Financeiro >
  Indicadores seguem sem valor até serem ligados a este cálculo. O cálculo puro
  (`calcularOcupacao`) mora em `common/ocupacao`, compartilhado com a classificação do parceiro.

## Classificação automática do parceiro (Gestão Profissionais)

Lê o contrato e o uso dos períodos (#139) de cada profissional e diz em que ponto da relação ele
está (issue #143, R §25, §27, §44 e §45). Regras confirmadas pelo dev (a seção 25 do documento só
exemplifica "Em risco"); a precedência é a ordem da lista:

1. **Inativo:** profissional inativo ou sem contrato de sala ativo e vigente hoje.
2. **Estratégico:** marcado à mão pela gerência (`PUT /profissionais/:id/estrategico`). Vale sobre
   as classes abaixo, mas não sobre "Inativo".
3. **Novo parceiro:** até 90 dias desde a assinatura do contrato mais antigo (sem assinatura, desde
   o início do contrato). Quem acabou de entrar ainda não é avaliado pelo uso.
4. **Em risco:** usou menos de 50% dos períodos contratados nos últimos 30 dias. O exemplo do
   documento (4 contratados, 1 usado) dá "1 de 4 períodos usados em 30 dias".
5. **Em expansão:** os períodos contratados por semana subiram em relação à semana de 30 dias antes
   (a semana tem cada dia uma vez, então a conta não oscila com quatro ou cinco segundas no mês), ou
   ele atendeu em mais períodos do que contratou nos últimos 30 dias.
6. **Parceiro ativo:** o caso comum.

- **Janela:** os 30 dias terminando ontem (o dia de hoje ainda está aberto). "Período" é o do
  Painel (Sala × Dia × Turno). Os dias de funcionamento da clínica não entram: vale a clínica toda.
- **Quando roda:** todo dia às 3h (fuso da clínica, `ProfissionaisClassificacaoAgendador`; desliga com
  `CAMPANHAS_AGENDADOR=off`), sob demanda em `POST /profissionais/classificacao/recalcular` (só quem
  vê a clínica toda) e na hora ao marcar ou desmarcar "Estratégico".
- **Onde fica:** a classificação vigente, o motivo (código + números, traduzido na tela) e a data da
  última mudança ficam no cadastro (`profissionais.classificacao*`). Só a **mudança de classe** vai
  para `profissionais_classificacoes` (somente inserção: classe anterior e nova, motivo, origem
  automática ou manual, quem marcou, dia de referência) e é auditada (`ProfissionalClassificacao`).
  Mudar só os números do motivo atualiza o cadastro, sem histórico.
- **API:** `GET /profissionais/:id/classificacoes` (histórico paginado, `profissionais.ver`);
  `GET /profissionais` aceita `classificacao=` e `sort=classificacao:asc`.
- **Tela:** coluna e filtro "Classificação" em Profissionais; no detalhe, a classe, o motivo, a
  marca "Parceiro estratégico" e o histórico.
- **Painel (aba Executivo):** KPIs "Profissionais em Risco" e "Profissionais em Expansão" e o alerta
  "N profissional(is) com baixa utilização", com o motivo de cada um.
- **Escopo (#153):** usuário restrito vê o histórico e as contagens só dos profissionais vinculados e
  não dispara o recálculo da clínica toda.

## Pacientes: relacionamento e consentimentos (`/clientes`)

Cadastro do paciente como informação de gestão (issue #148, R §8 e §41).

- **Campos novos:** `canalOrigem` (WhatsApp, telefone, site, presencial, redes sociais, outro),
  `whatsapp` (só se diferente do celular), `preferenciaComunicacao`, quem indicou
  (`indicacaoTipo` = `PACIENTE`, `PROFISSIONAL` ou `TEXTO`, com `indicacaoReferenciaId` ou
  `indicacaoTexto`; só o dado do tipo escolhido fica) e o profissional e a especialidade de vínculo
  (`profissionalVinculoId`, `especialidadeVinculoId`: um profissional principal, decisão do dev).
  Origem (Instagram, Indicação…) e canal (como o contato chegou) são coisas diferentes. Os ids não têm
  FK; o service valida pelos services donos (400 `PACIENTE_INDICACAO_INVALIDA`,
  `PACIENTE_PROFISSIONAL_INVALIDO`, `PACIENTE_ESPECIALIDADE_INVALIDA`). Usuário restrito (#153) só
  vincula um profissional do próprio escopo.
- **Calculados (só leitura, na listagem e no detalhe):** primeiro e último atendimento (agendamentos
  `ATENDIDO`), próximo retorno (agendamento futuro que não seja cancelado, falta, atendido nem a
  reagendar) e número de faltas (`FALTOU`). Agendamento excluído não conta.
- **Filtros do grid** (também na exportação): `origemClienteId`, `canalOrigem`, `semRetornoDias=N`
  (já foi atendido, o último atendimento foi há mais de N dias e não há nada agendado à frente),
  `comFaltas=true` e `novosDe`/`novosAte` (cadastrados no período, dias inteiros no fuso da clínica).
  As colunas Canal, Último atendimento, Próximo retorno e Faltas começam ocultas (botão **Colunas**).
- **Consentimentos (LGPD):** tabela `paciente_consentimentos`, só de inserção. Tipos
  `TRATAMENTO_DADOS`, `COMUNICACAO` e `CAMPANHAS`; cada registro tem aceito ou recusado, canal, versão
  do termo, observação, data e quem registrou. Revogar grava um novo registro; o histórico fica. O
  vigente é o mais recente do tipo.
  - `GET /api/comercial-atendimento/pacientes/:id/consentimentos` (`pacientes.ver`) e
    `POST` no mesmo caminho (`pacientes.editar`, auditado como `ConsentimentoPaciente`), ambos no
    escopo do usuário.
  - O cadastro novo exige a escolha explícita dos três tipos e do canal (`consentimentos` no
    `POST`). Na edição, os consentimentos mudam só pelo detalhe do paciente. O atalho
    `aceitaCampanhasWhatsapp` do `POST`/`PATCH` grava um registro só quando o valor muda; ausente, não
    altera.
  - **Espelhos no cadastro:** `aceitaCampanhasWhatsapp` e `aceitaComunicacao` são derivados do
    consentimento vigente e só o `ConsentimentosPacienteService` os grava. Sem nenhum registro do tipo,
    vale o padrão (pode receber). A migration cria o registro de revogação de quem já tinha recusado
    campanhas.
  - **Quem respeita:** campanhas e mensagens automáticas (`DestinatariosService`, e de novo na hora do
    envio, que cancela o que entrou na fila antes da revogação) exigem campanhas **e** comunicação
    aceitas; a pesquisa NPS também; as confirmações de agendamento exigem comunicação aceita (sem ela, o
    envio fica `FALHA` com `SEM_CONSENTIMENTO` no histórico). Revogar só campanhas não bloqueia
    confirmações.

## Prontuário privativo e log de acesso (`/prontuarios`)

Prontuário individual por profissional (issue #150, R §13, §14 e §37).

- **Registros clínicos privativos:** atendimentos, anamneses, receitas e histórico clínico são
  filtrados no service pelo escopo do usuário (#153). O médico só lista e abre o que é dos
  profissionais dele; paciente sem atendimento com ele dá 403, mesmo que outro médico o atenda.
- **Dados gerais compartilhados (decisão do dev):** alergias, medicamentos em uso, doenças crônicas,
  cirurgias, histórico familiar e observações são um por paciente e valem para todo profissional
  vinculado (segurança do paciente). Quem altera fica no `audit_log`.
- **Sem acesso clínico:** Recepção, Comercial e Financeiro não recebem `consultorio-assistencial.prontuarios.*`
  e levam 403. Administrador (escopo `TODOS`) vê tudo, com o acesso registrado.
- **Compartilhamento autorizado entre profissionais** (encaminhamento, equipe multiprofissional) **não
  existe**: fica para outra issue.
- **Log de acesso de leitura:** tabela `prontuario_acessos` (só inserção, só ids: usuário, paciente,
  recurso, data, `requestId`, IP). Cada GET de prontuário, atendimentos, anamneses, receitas e
  histórico grava um registro, depois de o escopo liberar; 403 e 404 não gravam. A escrita continua
  no `audit_log`.
  `GET /api/consultorio-assistencial/prontuarios/acessos?pacienteId=&usuarioId=&recurso=&page=&pageSize=`
  exige `consultorio-assistencial.prontuarios-acessos.ver` e escopo `TODOS` (restrito leva 403). Não há
  tela, só a API.

## Prontuário: exames, anexos, assinatura e versões (`/prontuarios`)

Funções fundamentais do prontuário pedidas pelo cliente (issue #151, R §13). Ficam no botão
**Detalhes** de cada atendimento, na aba Atendimentos. Rotas em
`/api/consultorio-assistencial/prontuarios/:pacienteId/atendimentos/:atendimentoId/...`; todas
aplicam o escopo do profissional responsável (#153) e gravam o acesso de leitura em `prontuario_acessos`.

- **Exames e anexos** (`/anexos`): PDF ou imagem (até 10 MB), com tipo (`EXAME` ou `ANEXO`), data e
  descrição. O arquivo é enviado antes em `/api/arquivos?uso=anexo-atendimento` e vinculado aqui. O uso é
  `privado`: `GET /api/arquivos/:id`, `/link` e `DELETE` recusam esse arquivo (403). O download é só por
  `GET .../anexos/:anexoId/link`, que confere o escopo e devolve o link temporário assinado.
- **Documentos emitidos** (`/documentos`): atestado, declaração e solicitação de exame (tipo, texto e data
  de emissão). Só o registro do texto; PDF com timbre e modelos ficam para a #152.
- **Assinatura** (`POST .../assinatura`, permissão `consultorio-assistencial.prontuarios.assinar`): confirmação
  com a **senha do próprio usuário**, que precisa estar vinculado ao profissional responsável (decisão do dev;
  certificado ICP-Brasil fora do escopo). A permissão separada impede que a recepção, também vinculada ao
  profissional, assine. Assinar finaliza o atendimento. Atendimento vindo da agenda precisa ser finalizado antes
  (`ATENDIMENTO_NAO_FINALIZADO`). Senha errada: 422 `ASSINATURA_SENHA_INVALIDA`.
- **Registro assinado não é editado:** `PATCH .../atendimentos/:id` (só antes de assinar) e a exclusão de exames e
  documentos respondem 409 `ATENDIMENTO_ASSINADO`. Exame e documento novos ainda podem ser acrescentados.
- **Adendo** (`POST .../adendos`, mesma permissão de assinar): a correção vira uma nova versão (decisão do dev),
  sem tocar no original. O histórico (`GET .../versoes`) lista a assinatura (versão 1) e cada adendo, com quem,
  quando, o conteúdo antes e depois e o hash SHA-256. A tabela `atendimento_versoes` só aceita inserção.

## Encaminhamentos (`/encaminhamentos`)

Encaminhamento de pacientes entre profissionais (issue #146, R §26), para medir o ecossistema
Torres. Tela fora do inventário, criada a partir dos requisitos do cliente (`TELAS_FORA_DO_INVENTARIO`
em `packages/shared/src/menu/menu.ts`).

- **API:** `/api/consultorio-assistencial/encaminhamentos` (listagem paginada, `export`, `POST`,
  `PATCH /:id`, `DELETE /:id` lógico), mais `GET .../profissionais` (selects de origem e destino) e
  `GET .../relatorio?de=&ate=` (por profissional). Permissões `consultorio-assistencial.encaminhamentos.*`.
- **Quem registra:** o profissional de origem ou a recepção (decisão do dev). O usuário restrito
  (#153) só registra pela própria origem, para paciente vinculado, e só altera ou exclui os de que
  é origem. Ele **vê** os encaminhamentos em que um dos seus profissionais é origem ou destino.
- **Contrato:** origem e destino precisam de contrato de sala ativo e vigente com "Permite
  indicação" (`ContratosSalaService.profissionaisQuePermitemIndicacao`). Ao alterar, só o
  profissional que mudou é revalidado. Erros: `ORIGEM_SEM_INDICACAO` e `DESTINO_SEM_INDICACAO` (422).
- **Situação derivada:** não é coluna. `ATENDIDO` quando há atendimento finalizado (ou agendamento
  atendido) do paciente com o destino a partir do dia do encaminhamento; `AGENDADO` com agendamento
  ativo (sem cancelado, reagendar ou falta); senão `ENCAMINHADO`. Por isso o filtro, a ordenação e a
  paginação por situação acontecem em memória, depois do filtro de banco.
- **Privacidade (R §14):** o encaminhamento guarda só paciente, profissionais, especialidade, data e
  motivo. O destino vê o nome do paciente, nunca prontuário ou dado clínico.
- **Relatório:** por profissional, enviados, recebidos e conversão (atendidos ÷ total, em %). Usuário
  restrito vê só as linhas dos próprios profissionais.

## Relatórios (`ReportPage` + `common/relatorios`)

As 7 telas de Relatórios usam a mesma estrutura: seletor de relatório, período De/Até e o
resultado no `DataGrid`, com exportação Excel/PDF. Cada módulo só declara os relatórios dele na API.
O exemplo é o `EX-01` em `/gestao/relatorios` (`modules/configuracoes-gestao/relatorios`).

- **API:** um provider do módulo implementa `ProvedorRelatorios` com uma lista de `definirRelatorio({...})`.
  O módulo registra `criarRelatoriosController('<modulo>.relatorios', Provider)`, que cria:
  - `GET /api/<modulo>/relatorios`: catálogo com colunas e filtros, só com os relatórios permitidos;
  - `GET /api/<modulo>/relatorios/:id?de=&ate=&page=&pageSize=&sort=&<filtros>`: `{ data, meta }`;
  - `GET /api/<modulo>/relatorios/:id/export?format=xlsx|pdf&columns=`: auditado como `EXPORT`
    (entidade `Relatorio`, `entityId` = id do relatório).
  ```ts
  definirRelatorio<ContaReceber>({
    id: 'FIN-01',
    nome: 'Inadimplencia',
    permissao: 'financeiro.contas-receber.ver', // opcional, além de financeiro.relatorios.ver
    colunas: [{ key: 'vencimento', header: 'Vencimento', type: 'date', ordenavel: true, value: (c) => c.vencimento }],
    ordenacaoPadrao: 'vencimento:asc',
    filtros: [{ tipo: 'select', parametro: 'situacao', rotulo: 'Situação', opcoes: [...] }],
    buscar: (consulta, pagina) => service.inadimplencia(consulta.intervalo, consulta.sort, pagina),
    contar: (consulta) => service.contarInadimplencia(consulta.intervalo),
  });
  ```
  - **Permissões:** a tela exige `<modulo>.relatorios.ver` (`exportar` para exportar). O campo
    `permissao` (opcional) usa uma permissão que já existe no catálogo. Sem ela, o relatório não
    aparece no catálogo e responde 403.
  - **Período:** `de`/`ate` (`AAAA-MM-DD`) são obrigatórios. O schema compartilhado
    (`periodoRelatorioSchema`) valida De ≤ Até. `consulta.intervalo` traz `[gte, lt)` em dias
    inteiros no fuso da clínica, e `consulta.periodo` traz as datas como vieram.
  - **Erros:** id desconhecido → 404 `RELATORIO_NAO_ENCONTRADO`; query inválida → 400; exportação
    acima de 10.000 linhas → 422.
  - **Fila:** `common/relatorios/relatorio-fila.ts` define só a interface (`FILA_RELATORIOS`), para
    os relatórios pesados. A mensageria já existe, mas o consumidor de relatórios ainda não:
    hoje tudo é síncrono.
- **Front:** a página da tela usa a `ReportPage`, e as colunas e os filtros vêm da API.
  ```tsx
  <ReportPage
    tela="financeiro.relatorios"
    titulo="Relatórios Financeiros"
    descricao="Faturamento, inadimplência, contas a pagar/receber, DRE e mais."
    breadcrumb={[
      { rotulo: 'Painel', para: '/' },
      { rotulo: 'Financeiro' },
      { rotulo: 'Relatórios' },
    ]}
  />
  ```
  - O resultado carrega ao escolher o relatório ou mudar o período, sem botão. O período padrão é
    o dos últimos 30 dias até hoje. Relatório e período ficam na URL (`?relatorio=&de=&ate=`).
  - As células são formatadas pelo `tipo` da coluna (`text`, `number`, `currency`, `date`,
    `datetime`, `boolean`), como na exportação.

## Auditoria: consulta da trilha (`/gestao/auditoria`)

Tela geral do `audit_log` (issue #155, R §15 e §41): quem, o quê, quando, e o antes e depois. Tela
fora do inventário, em Configurações / Gestão. A gravação continua na seção 4 do `CLAUDE.md`.

- **API:** `GET /api/auditoria` (`configuracoes-gestao.auditoria.ver`) com os filtros `entity`,
  `entityId`, `userId`, `action`, `grupo`, `de`/`ate` (dia `AAAA-MM-DD` inteiro no fuso da clínica,
  ou instante com fuso), `search` (nome da entidade ou id), `sort` (`occurredAt`, `entity`,
  `action`) e paginação. Filtros combinados valem todos juntos. Cada item traz `userNome`, `campos`
  (campos alterados) e `restrito`. `GET /api/auditoria/entidades` lista as entidades com registro.
- **Atalhos (`grupo`):** `exclusoes` (ação `DELETE`), `cancelamentos` (`UPDATE` que deixou `status`
  em `CANCELADO`/`CANCELADA`), `descontos`, `financeiro`, `agenda`, `sala`, `contrato` e
  `prontuario`. As entidades de cada um ficam em `AUDIT_GRUPOS_DEFINICAO`
  (`packages/shared/src/schemas/auditoria/audit-log.ts`), uma inferência a partir do requisito:
  ao nascer uma entidade de agenda, financeiro, sala, contrato ou prontuário, inclua-a lá.
- **Conteúdo clínico:** em `Prontuario`, `Atendimento`, `AtendimentoEvolucao`, `AtendimentoReceita`
  e `Anamnese` (`AUDIT_ENTIDADES_CLINICAS`), `before` e `after` só saem para quem tem
  `consultorio-assistencial.prontuarios.ver` (decisão do dev). Sem ela, o item vem `restrito` com
  `before`/`after` nulos; quem, quando e os nomes dos campos continuam visíveis.
- **Diff:** `diffAuditoria(before, after)` (`@torres/shared`) lista os campos que mudaram (sem
  `updatedAt`/`createdAt`); em criação e exclusão, todos. O modal mostra campo a campo, com o
  rótulo traduzido (`auditoria.campos.*`; campo sem tradução aparece com o nome técnico).
- **Exportação:** `GET /api/auditoria/export` (`configuracoes-gestao.auditoria.exportar`, só o
  Administrador no seed), com os mesmos filtros. Exporta só metadados (data, usuário, ação, entidade,
  registro e nomes dos campos), nunca o antes e depois. É auditada (`EXPORT`, entidade `AuditLog`).
- **Escopo (#153):** a tela é da administração (escopo `TODOS`), então não há filtro por
  profissional. O filtro de usuário usa o lookup `usuarios`.

## Backup e restauração (`common/backup`)

Requisito do cliente (R §40, issue #157): backup automático, redundância fora do servidor, registro
de cada execução, alerta de falha e restauração testada. Fica desligado até `BACKUP_ATIVO=on`.

### O que faz

| Quando (fuso de São Paulo)              | O quê                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Todo dia, 2h (`BACKUP_CRON`)            | `pg_dump` do banco e cópia dos arquivos novos do storage (MinIO/S3)                                 |
| Domingo, 4h (`BACKUP_RESTAURACAO_CRON`) | **Restauração de teste** do último backup num banco descartável, com conferência                    |
| A pedido                                | `POST /api/configuracoes-gestao/backups/executar` e `.../restauracao-teste` (202, em segundo plano) |

- **Cifrado antes de sair do servidor:** AES-256-GCM, com a frase de `BACKUP_CRIPTO_CHAVE` (scrypt +
  salt por arquivo). O destino só vê arquivos ilegíveis. **Guarde uma cópia da frase fora do
  servidor**: sem ela não há restauração.
- **Destino externo:** um bucket S3-compatível (`BACKUP_DESTINO_*`) em outro provedor ou servidor.
  Estrutura: `postgres/torres-<AAAAMMDD>T<HHMMSS>Z.dump.enc` (mais um `.manifest.json` com checksum e
  contagem de linhas por tabela) e `arquivos/<chave do storage>.enc`. Os arquivos já copiados são
  pulados (anexos não mudam) e apagar na origem não apaga a cópia.
- **Retenção:** guarda o último dump de cada um dos 7 dias, 4 semanas e 6 meses mais recentes
  (`BACKUP_RETENCAO_*`). O dump mais recente nunca é apagado.
- **Registro:** cada execução grava uma linha em `backup_execucoes` (tipo, status, origem, início,
  fim, tamanho, checksum, arquivos copiados, chave no destino e código de erro). Consulta:
  `GET /api/configuracoes-gestao/backups` (permissão `configuracoes-gestao.backups.ver`, só o
  Administrador). Uma execução que a API deixou pendente por ter caído vira falha na subida.
- **Alerta de falha:** toda falha grava um log de erro com `"alerta":"BACKUP_FALHOU"` e, se
  `BACKUP_ALERTA_WEBHOOK_URL` estiver definida, envia um `POST` JSON
  (`{ evento, tipo, codigo, execucaoId, ocorridoEm }`, sem dados pessoais). Aponte o webhook para o
  canal da equipe e/ou configure o monitoramento do servidor para esse log. Códigos de falha:
  `BACKUP_DUMP_FALHOU`, `BACKUP_ENVIO_FALHOU`, `BACKUP_ARQUIVOS_FALHOU`, `RESTAURACAO_SEM_BACKUP`,
  `RESTAURACAO_CHECKSUM_DIVERGENTE`, `RESTAURACAO_FALHOU` e `RESTAURACAO_CONTAGEM_DIVERGENTE`.
- **Arquivos do storage:** só são copiados com `STORAGE_DRIVER=s3`. Com o driver local (só
  desenvolvimento) o backup cobre apenas o banco.
- A imagem da API traz o cliente do PostgreSQL 17 (`pg_dump`, `pg_restore`, `psql`). Depois de
  atualizar o `docker/dev.Dockerfile`, rode `docker compose up -d --build`.

### Restauração de teste

Baixa o último dump, confere o checksum, decifra, cria o banco `torres_restore_<timestamp>`, restaura
com `pg_restore`, compara a contagem de linhas de **todas** as tabelas com o manifesto, baixa e
decifra um arquivo de amostra do storage e remove o banco de teste (mesmo em caso de erro). Por
padrão o banco de teste nasce no mesmo servidor do banco de produção; para um ambiente realmente
separado, aponte `BACKUP_RESTAURACAO_URL` para outro servidor PostgreSQL.

### Política de recuperação (RPO e RTO)

> **Valores iniciais, a confirmar com o cliente** (a issue #157 deixa isso em aberto).

| Item                               | Valor inicial                     |
| ---------------------------------- | --------------------------------- |
| **RPO** (perda máxima de dados)    | 24 h (último backup diário)       |
| **RTO** (tempo máximo para voltar) | 4 h                               |
| Retenção                           | 7 diários, 4 semanais e 6 mensais |
| Teste de restauração               | semanal, automático, com registro |

### Como restaurar em caso de desastre

1. Suba um PostgreSQL 17 vazio e o MinIO/S3 novos; tenha em mãos a frase `BACKUP_CRIPTO_CHAVE`.
2. Baixe do destino o `postgres/torres-*.dump.enc` mais recente (ou o da data desejada) e confira o
   `sha256` do `.manifest.json` correspondente.
3. Decifre o arquivo, com a frase guardada fora do servidor:
   `BACKUP_CRIPTO_CHAVE=<frase> pnpm --filter @torres/api backup:decifrar <dump.enc> <dump>`.
4. Rode `pg_restore --no-owner -d <banco novo> <dump>` e suba a API (as migrations pendentes são
   aplicadas).
5. Recopie `arquivos/*.enc` para o bucket do storage, decifrando cada um e removendo o `.enc` e o
   prefixo `arquivos/` da chave.

### Checklist antes de desligar o DrIntelli

- [ ] `BACKUP_ATIVO=on` em produção, com destino **fora** do servidor principal.
- [ ] Frase de cifra guardada em dois lugares fora do servidor.
- [ ] Ao menos uma restauração de teste com sucesso no histórico (`GET .../backups?tipo=RESTAURACAO_TESTE`).
- [ ] Alerta de falha chegando ao canal da equipe (teste derrubando o destino de propósito).
- [ ] RPO, RTO e retenção confirmados pelo cliente.

## Mensageria (RabbitMQ, `common/messaging`)

Regras e nomes na seção 5 do [`CLAUDE.md`](CLAUDE.md). O `MessagingModule` é global.

- **Publicar** (evento ou comando): injete o `EventPublisher`. Ele grava na tabela
  `outbox_events` pela transação atual (`txHost.tx`). O `OutboxRelay` publica no RabbitMQ só o que
  foi commitado: se a transação for desfeita, o evento some junto. Com o broker fora, os eventos
  esperam na outbox.
  ```ts
  await this.events.publish('comercial.venda.paga', { vendaId: venda.id });
  ```
  - O exchange (`topic`, durável) é `torres.<primeiro segmento>` e é declarado no primeiro uso.
  - O envelope é `{ eventId, type, occurredAt, userId, payload, version }`. O `userId` vem do
    contexto (`system` fora de HTTP). Payload com campo de dado pessoal (`cpf`, `nome`, `telefone`…,
    a mesma lista da redaction do log) é recusado: envie só ids.
- **Consumir:** crie um provider no módulo consumidor.
  ```ts
  @Injectable()
  @MessageConsumer({
    queue: 'financeiro.gerar-titulo-venda',
    events: ['comercial.venda.paga'],
    payloadSchema: z.object({ vendaId: z.uuid() }), // opcional
  })
  export class GerarTituloVendaConsumer extends BaseConsumer<{ vendaId: string }> {
    constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
      super();
    }
    async handle({ payload }: MessageEnvelope<{ vendaId: string }>) {
      // busca o que precisar pelo id; use this.txHost.tx e AuditService.record
    }
  }
  ```
  - Na inicialização são declaradas a fila, a `<fila>.retry` e a `<fila>.dlq` (duráveis), e a
    fila é ligada aos eventos.
  - **Idempotência:** `handle` roda numa transação junto com o registro em `processed_events`
    (`eventId` + fila). Mensagem repetida é confirmada sem chamar `handle`. Se `handle` falhar, o
    registro é desfeito. Chamada a sistema externo não volta atrás com a transação: o handler deve
    tolerar repetição.
  - **Retry:** cada falha manda a mensagem para a `<fila>.retry` com espera exponencial
    (`MESSAGING_RETRY_BASE_MS`, dobrando até `MESSAGING_RETRY_MAX_MS`). Na tentativa
    `MESSAGING_MAX_ATTEMPTS`, ela vai para a `<fila>.dlq` com os headers `x-attempts` e `x-error`
    (tipo do erro). Envelope ou payload inválido vai direto para a DLQ.
  - **Auditoria:** o contexto do consumidor tem o `userId` do envelope. `AuditService.record`
    grava com esse usuário.
  - **Logs:** só fila, `eventId`, tipo, tentativa e tipo do erro. Nunca o payload nem a mensagem
    do erro.
- **Health:** `GET /api/health` traz `checks.mensageria` (`up`/`down`) e continua 200 com o
  RabbitMQ fora.
- **Testes:** os e2e (`test/messaging`) usam o RabbitMQ do Compose (ou `RABBITMQ_URL_TEST`) e
  `test/utils/rabbitmq.ts` para preparar filas e inspecionar a DLQ. No CI, o RabbitMQ roda como
  service do job.

## Autenticação e permissões

- **Entrar no ambiente local:** `docker compose exec api pnpm --filter @torres/api db:seed` cria o
  perfil **Administrador** (todo o catálogo de permissões) e o usuário `admin@example.com`, com a
  senha de `SEED_ADMIN_PASSWORD` no `.env`. Rode o seed de novo depois de adicionar telas ou ações
  ao catálogo.
- **API:** todo endpoint é protegido pelo guard global e precisa declarar o acesso, ou o guard
  responde 403 (o teste `test/auth/acesso-rotas.e2e-spec.ts` aponta qual esqueceu):
  - `@RequirePermission('<modulo>.<recurso>.<acao>')`, o padrão das telas;
  - `@SomenteAutenticado()`, para infraestrutura usada por várias telas (ex.: arquivos);
  - `@Public()`, para rotas sem login (health, login).
- **Catálogo:** `packages/shared/src/auth/permissoes.ts` (cada tela × `ver`, `criar`, `editar`,
  `excluir`, `exportar`).
- **e2e:** `criarUsuarioTeste(app, { permissoes })` e `comUsuario(app, usuario)`
  (`apps/api/test/utils/auth.ts`) criam um usuário com token real.
- **Front:** o menu e o ⌘K mostram só as telas com `<tela>.ver`. Para esconder botões, use
  `usePermissao('...')` ou `<SePermitido permissao="...">`.
- **Sessão:** o access token (15 min) fica só em memória. O refresh token vai em cookie
  httpOnly e muda a cada uso. Em HTTP sem TLS, use `AUTH_COOKIE_SECURE=false`.

## Segurança e LGPD (política de senhas, exportação e encerramento de acesso)

Issue #156 (R §41). A política fica na tela **Minha Empresa > aba Segurança** (`GET/PUT
/api/configuracoes-gestao/politica-seguranca`, permissões `minha-empresa.ver/editar`, auditada
como `PoliticaSeguranca`). Sem registro, valem os padrões de `POLITICA_PADRAO`
(`packages/shared`), confirmados pelo dev.

- **Senha:** `senhaNovaSchema` mantém o piso fixo (8 a 128 caracteres, letras e números). A
  política soma tamanho mínimo (8 a 64), maiúscula e símbolo, validados por
  `PoliticaSegurancaService.garantirSenhaValida` no cadastro e na redefinição de senha do usuário,
  na redefinição por link e na troca. A recusa é 400 `SENHA_FORA_DA_POLITICA`, com uma mensagem por
  regra no campo.
- **Bloqueio:** ao atingir `tentativasBloqueio` falhas seguidas (padrão 5), a conta fica bloqueada por
  `minutosBloqueio` (padrão 15) e a ação é auditada (`motivo: TENTATIVAS_DE_LOGIN`). Bloqueada, a
  conta responde igual a senha errada (`CREDENCIAIS_INVALIDAS`), mesmo com a senha certa, para não
  revelar que ela existe. Redefinir a senha (link ou administrador) desbloqueia. O rate limit por IP
  continua valendo.
- **Primeiro acesso e expiração:** senha definida ou redefinida por um administrador é provisória
  (`trocaPrimeiroAcesso`, padrão ligado). Com `expiracaoDias` (padrão vazio = não expira), a senha
  mais antiga que o prazo vira troca pendente no login. Com a troca pendente, todas as rotas
  respondem 403 `TROCA_SENHA_OBRIGATORIA`, menos as marcadas com `@PermitidoComTrocaSenha()`
  (`/auth/me`, `/auth/regras-senha` e `/auth/trocar-senha`); o front leva para `/trocar-senha`.
  `POST /api/auth/trocar-senha` pede a senha atual e derruba as outras sessões.
- **Encerramento de acesso do profissional:** o `AcessoProfissionalService`
  (`gestao-profissionais`) reavalia o profissional ao encerrar ou cancelar um contrato, ao inativá-lo
  ou excluí-lo e todo dia às 2h (`AcessoProfissionalAgendador`, desligado com
  `CAMPANHAS_AGENDADOR=off`). Sem contrato que dê acesso, os usuários vinculados são desativados, as
  sessões revogadas e o `audit_log` registra (`motivo`). Dão acesso: contrato ativo sem data final ou
  ainda vigente, contrato aguardando assinatura e contrato encerrado ou cancelado até
  `carenciaProfissionalDias` depois do encerramento (padrão 0 = acaba no dia). Profissional que nunca
  teve contrato não é governado pela regra; usuário ligado a mais de um profissional só perde o
  acesso quando nenhum deles o mantém. O funcionário desligado fica para uma issue própria, porque
  `Funcionario` ainda não tem vínculo com `Usuario`.
- **Exportação:** além de `<tela>.exportar`, as exportações de dados pessoais ou clínicos exigem
  `configuracoes-gestao.dados-pessoais.exportar` (403 sem ela). Marque o endpoint com
  `@ExportaDadosPessoais()`; hoje valem Pacientes, Profissionais, Funcionários, Usuários,
  Encaminhamentos, Prescrições, Soroterapia, Contas a Receber e Contratos de sala. Os perfis padrão
  Administrador, Gerência e Financeiro recebem a permissão (migration
  `perfis_padrao_exportar_dados_pessoais`). O **relatório de exportações** é o atalho "Exportações" da
  tela Auditoria (`GET /api/auditoria?grupo=exportacoes`): quem exportou o quê e quando.

## Exportação completa de dados (CSV, prontuário em PDF e lote)

Issue #158 (R §39): a clínica precisa conseguir levar todos os seus dados. Três partes:

- **CSV em qualquer grid.** `format=csv` vale em todo `GET .../export` (mesma query, filtros e colunas
  de Excel e PDF), pelo `ExportService`. O arquivo é UTF-8 com BOM, separador `;`, números com vírgula
  decimal e datas como no grid. Texto que começa com `= + - @` ganha um apóstrofo (CSV injection).
  O teto de 10 mil linhas do grid continua valendo (422 `EXPORT_LIMIT_EXCEEDED`).
- **Prontuário completo do paciente.** `GET /api/consultorio-assistencial/prontuarios/:pacienteId/exportar`
  devolve o PDF com o prontuário, atendimentos (evoluções, receitas, documentos, anexos e adendos),
  anamneses e prescrições. `?profissionalId=` restringe a um profissional e `?incluirAnexos=true`
  devolve um ZIP com o PDF e os arquivos (até 100 MB de anexos). Segue o escopo por profissional
  (#150, #153): só entram registros dos profissionais do usuário e fora do escopo é 403. Exige
  `prontuarios.exportar` e `dados-pessoais.exportar`, grava `audit_log` `EXPORT` e o log de acesso
  (`recurso EXPORTACAO`). Botão **Exportar prontuário** no cabeçalho da tela Prontuários.
- **Exportação em lote por entidade.** Aba **Exportação de dados** em Minha Empresa (só administração:
  `configuracoes-gestao.exportacao-lote.ver/executar` e `dados-pessoais.exportar`; perfil com escopo
  restrito recebe 403). `POST /api/configuracoes-gestao/exportacoes-lote` grava o pedido
  (`ExportacaoLote`, auditado) e publica `configuracoes-gestao.exportacao-lote.gerar`; o consumidor
  `configuracoes-gestao.gerar-exportacao-lote` monta o ZIP (CSVs, `LEIAME.txt`, arquivos e o índice
  `arquivos.csv`), guarda no storage (uso `exportacao-lote`, privado) e marca a conclusão. O download
  (`GET .../:id/download`) exige login e permissão, é auditado (`EXPORT`) e vale por 24 horas
  (depois, 410). Idempotente (só o pedido `PENDENTE` é processado), com um pedido por entidade por vez
  (409) e falha com código estável (`ARQUIVOS_ACIMA_DO_LIMITE` acima de 200 MB de arquivos).

Cada módulo dono registra a sua **fonte** (`FonteExportacaoLote`, em `common/export`): pacientes,
agendamentos, profissionais, contratos de sala (com PDFs), contas a receber, contas a pagar e
prontuários (com anexos). Para incluir uma entidade nova, estenda `FonteExportacaoLoteBase`, registre
o provider no módulo e acrescente o id em `EXPORTACAO_LOTE_ENTIDADES` (`packages/shared`). O consumidor
roda sem o teto de linhas (`ExportService.semLimite`) e com a transação de até 15 minutos
(`transactionTimeoutMs` do `@MessageConsumer`).

## Scripts (na raiz)

```bash
pnpm install
pnpm lint        # ESLint + Prettier
pnpm typecheck
pnpm test        # Jest (api), Vitest (web e shared)
pnpm build
```

## CI

`.github/workflows/ci.yml` roda em todo PR e push na `main`: install, lint, typecheck,
migrations no banco de teste (Postgres de serviço do job), testes e build. Em seguida, o job **SonarQube Cloud** envia a análise e a cobertura (lcov do
Jest e do Vitest) e falha quando o Quality Gate reprova. A configuração fica em
[`sonar-project.properties`](sonar-project.properties) e o token no secret `SONAR_TOKEN`.
