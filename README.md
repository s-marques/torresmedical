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

### Variáveis de ambiente (`.env`)

O `.env` nunca é commitado. O [`.env.example`](.env.example) lista as variáveis sem valores reais:

| Variável                                            | Uso                                               |
| --------------------------------------------------- | ------------------------------------------------- |
| `WEB_PORT`                                          | Porta externa do front (padrão 5173)              |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciais do PostgreSQL                         |
| `DATABASE_URL`                                      | Conexão da API com o PostgreSQL (host `postgres`) |
| `DATABASE_URL_TEST`                                 | Banco dos testes (nome termina com `_test`)       |
| `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`    | Credenciais do RabbitMQ                           |
| `RABBITMQ_URL`                                      | Conexão da API com o RabbitMQ (host `rabbitmq`)   |
| `API_PORT`                                          | Porta interna da API (padrão 3000)                |
| `LOG_LEVEL`                                         | Nível do log da API (`info`, `debug`…)            |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`            | Credenciais do MinIO                              |
| `STORAGE_DRIVER`                                    | `s3` (MinIO, no Docker) ou `local` (disco)        |
| `STORAGE_S3_*`                                      | Endpoint, bucket e chaves do S3/MinIO             |
| `STORAGE_S3_BUCKET_TEST`                            | Bucket dos testes (nome termina com `-test`)      |
| `STORAGE_LOCAL_DIR`                                 | Pasta do driver `local` (padrão `storage`)        |
| `STORAGE_URL_SECRET`                                | Segredo das URLs temporárias de download          |
| `STORAGE_URL_TTL_SECONDS`                           | Validade dessas URLs (padrão 300)                 |

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
