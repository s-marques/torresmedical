-- CreateEnum
CREATE TYPE "nao_conformidade_tipo" AS ENUM ('PROCESSO', 'PRODUTO', 'SERVICO', 'DOCUMENTAL', 'SEGURANCA');

-- CreateEnum
CREATE TYPE "nao_conformidade_status" AS ENUM ('ABERTA', 'EM_TRATAMENTO', 'CORRIGIDA', 'FECHADA');

-- CreateTable
CREATE TABLE "nao_conformidades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "setor" TEXT,
    "tipo" "nao_conformidade_tipo" NOT NULL,
    "data_ocorrencia" DATE,
    "data_limite_correcao" DATE,
    "responsavel" TEXT,
    "acao_corretiva" TEXT,
    "observacoes" TEXT,
    "status" "nao_conformidade_status" NOT NULL DEFAULT 'ABERTA',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "nao_conformidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nao_conformidades_status_idx" ON "nao_conformidades"("status");

-- CreateIndex
CREATE INDEX "nao_conformidades_data_ocorrencia_idx" ON "nao_conformidades"("data_ocorrencia");
