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
| `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`    | Credenciais do RabbitMQ                           |
| `RABBITMQ_URL`                                      | Conexão da API com o RabbitMQ (host `rabbitmq`)   |
| `API_PORT`                                          | Porta interna da API (padrão 3000)                |
| `LOG_LEVEL`                                         | Nível do log da API (`info`, `debug`…)            |

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
testes e build. Em seguida, o job **SonarQube Cloud** envia a análise e a cobertura (lcov do
Jest e do Vitest) e falha quando o Quality Gate reprova. A configuração fica em
[`sonar-project.properties`](sonar-project.properties) e o token no secret `SONAR_TOKEN`.
