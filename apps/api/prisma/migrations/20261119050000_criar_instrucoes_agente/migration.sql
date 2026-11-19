-- CreateEnum
CREATE TYPE "agente_instrucao_status" AS ENUM ('RASCUNHO', 'EM_TESTE', 'APROVADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "agente_alerta_tipo" AS ENUM ('NUMERO', 'GRUPO');

-- CreateEnum
CREATE TYPE "agente_regra_tipo" AS ENUM ('POS_RESPOSTA', 'PRE_TOOL');

-- CreateEnum
CREATE TYPE "agente_regra_acao" AS ENUM ('BLOQUEAR', 'SUBSTITUIR', 'ALERTAR');

-- CreateTable
CREATE TABLE "agente_instrucoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "temperatura" DECIMAL(3,2) NOT NULL,
    "max_tokens" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "system_prompt" TEXT NOT NULL,
    "status" "agente_instrucao_status" NOT NULL DEFAULT 'RASCUNHO',
    "versao_atual" INTEGER NOT NULL DEFAULT 1,
    "aprovado_por" UUID,
    "aprovado_por_nome" TEXT,
    "aprovado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "agente_instrucoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_instrucao_versoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instrucao_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "temperatura" DECIMAL(3,2) NOT NULL,
    "max_tokens" INTEGER NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "criado_por" UUID,
    "criado_por_nome" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_instrucao_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_instrucoes_extras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "agente_instrucoes_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_alertas_destinos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "agente_alerta_tipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "agente_alertas_destinos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_regras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "agente_regra_tipo" NOT NULL,
    "gatilho" TEXT NOT NULL,
    "acao" "agente_regra_acao" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "agente_regras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agente_instrucoes_status_idx" ON "agente_instrucoes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agente_instrucao_versoes_instrucao_id_numero_key" ON "agente_instrucao_versoes"("instrucao_id", "numero");

-- CreateIndex
CREATE INDEX "agente_alertas_destinos_numero_idx" ON "agente_alertas_destinos"("numero");

-- CreateIndex
CREATE INDEX "agente_regras_nome_idx" ON "agente_regras"("nome");

-- AddForeignKey
ALTER TABLE "agente_instrucao_versoes" ADD CONSTRAINT "agente_instrucao_versoes_instrucao_id_fkey" FOREIGN KEY ("instrucao_id") REFERENCES "agente_instrucoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
