# Imagem de desenvolvimento compartilhada por api e web.
# As dependências ficam na imagem; o código entra por volume (hot reload).
FROM node:22-alpine

# store-dir fixo: em runtime o node_modules é um volume (outro dispositivo) e,
# sem isso, o pnpm escolheria outro store e tentaria recriar tudo.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    npm_config_store_dir=/pnpm/store \
    CI=true
# Cliente do PostgreSQL (pg_dump, pg_restore, psql): o backup (issue #157) roda dentro da API.
# A versão acompanha o servidor (postgres:17).
RUN apk add --no-cache postgresql17-client

RUN corepack enable && corepack prepare pnpm@10.34.7 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
ENTRYPOINT ["dev-entrypoint.sh"]
