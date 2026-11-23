-- CreateEnum
CREATE TYPE "coleta_residuo_tipo" AS ENUM ('INFECTANTE', 'PERFUROCORTANTE', 'QUIMICO');

-- CreateTable
CREATE TABLE "coletas_residuo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "data_coleta" DATE NOT NULL,
    "proxima_coleta" DATE,
    "empresa_coletora" TEXT,
    "manifesto_mtr" TEXT,
    "peso_kg" DECIMAL(10,2),
    "tipo_residuo" "coleta_residuo_tipo" NOT NULL,
    "responsavel" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "coletas_residuo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coletas_residuo_data_coleta_idx" ON "coletas_residuo"("data_coleta");
