#!/bin/sh
set -e

# Sincroniza os volumes de node_modules com o lockfile (rápido: usa o store da imagem).
pnpm install --frozen-lockfile --offline
# A API (CJS) e o web importam o build do shared.
pnpm --filter @torres/shared build

exec "$@"
