-- CreateEnum
CREATE TYPE "ai_growth_status_analise" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "ai_growth_prioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateTable
CREATE TABLE "analises_ai_growth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "ai_growth_status_analise" NOT NULL DEFAULT 'PENDENTE',
    "solicitada_por_id" UUID,
    "erro" TEXT,
    "solicitada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMPTZ(3),
    "concluida_em" TIMESTAMPTZ(3),

    CONSTRAINT "analises_ai_growth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights_ai_growth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analise_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "prioridade" "ai_growth_prioridade" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_ai_growth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analises_ai_growth_status_idx" ON "analises_ai_growth"("status");

-- CreateIndex
CREATE INDEX "analises_ai_growth_solicitada_em_idx" ON "analises_ai_growth"("solicitada_em");

-- CreateIndex
CREATE INDEX "insights_ai_growth_analise_id_ordem_idx" ON "insights_ai_growth"("analise_id", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "insights_ai_growth_analise_id_tipo_key" ON "insights_ai_growth"("analise_id", "tipo");

-- AddForeignKey
ALTER TABLE "insights_ai_growth" ADD CONSTRAINT "insights_ai_growth_analise_id_fkey" FOREIGN KEY ("analise_id") REFERENCES "analises_ai_growth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
