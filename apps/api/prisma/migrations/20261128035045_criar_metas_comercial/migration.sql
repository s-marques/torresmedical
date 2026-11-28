-- CreateEnum
CREATE TYPE "meta_comercial_metrica" AS ENUM ('LEADS', 'VISITAS', 'PROPOSTAS', 'CONTRATOS_FECHADOS', 'RECEITA_NOVA');

-- CreateEnum
CREATE TYPE "meta_comercial_periodo_tipo" AS ENUM ('MES', 'TRIMESTRE');

-- CreateTable
CREATE TABLE "metas_comercial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "metrica" "meta_comercial_metrica" NOT NULL,
    "periodo_tipo" "meta_comercial_periodo_tipo" NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "responsavel_id" UUID,
    "valor" DECIMAL(14,2) NOT NULL,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "metas_comercial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metas_comercial_data_inicio_data_fim_idx" ON "metas_comercial"("data_inicio", "data_fim");

-- CreateIndex
CREATE INDEX "metas_comercial_responsavel_id_idx" ON "metas_comercial"("responsavel_id");

-- CreateIndex
CREATE INDEX "metas_comercial_metrica_idx" ON "metas_comercial"("metrica");
