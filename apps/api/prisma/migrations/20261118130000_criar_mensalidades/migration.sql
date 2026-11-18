-- CreateEnum
CREATE TYPE "mensalidade_status" AS ENUM ('ATIVO', 'PAUSADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "mensalidades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "dia_vencimento" INTEGER NOT NULL,
    "forma_pagamento_id" UUID,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "observacoes" TEXT,
    "status" "mensalidade_status" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "mensalidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensalidade_titulos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mensalidade_id" UUID NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "conta_receber_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensalidade_titulos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensalidades_paciente_id_idx" ON "mensalidades"("paciente_id");

-- CreateIndex
CREATE INDEX "mensalidades_forma_pagamento_id_idx" ON "mensalidades"("forma_pagamento_id");

-- CreateIndex
CREATE INDEX "mensalidades_status_idx" ON "mensalidades"("status");

-- CreateIndex
CREATE INDEX "mensalidades_created_at_idx" ON "mensalidades"("created_at");

-- CreateIndex
CREATE INDEX "mensalidade_titulos_mensalidade_id_idx" ON "mensalidade_titulos"("mensalidade_id");

-- CreateIndex
CREATE UNIQUE INDEX "mensalidade_titulos_mensalidade_id_competencia_key" ON "mensalidade_titulos"("mensalidade_id", "competencia");

-- AddForeignKey
ALTER TABLE "mensalidades" ADD CONSTRAINT "mensalidades_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensalidades" ADD CONSTRAINT "mensalidades_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensalidade_titulos" ADD CONSTRAINT "mensalidade_titulos_mensalidade_id_fkey" FOREIGN KEY ("mensalidade_id") REFERENCES "mensalidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
