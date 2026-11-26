-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "conta_receber_status" ADD VALUE 'PARCIAL';
ALTER TYPE "conta_receber_status" ADD VALUE 'RENEGOCIADO';

-- AlterTable
ALTER TABLE "contas_receber" ADD COLUMN     "competencia" VARCHAR(7),
ADD COLUMN     "contrato_sala_id" UUID,
ADD COLUMN     "profissional_sacado_id" UUID,
ADD COLUMN     "renegociado_de_id" UUID;

-- CreateTable
CREATE TABLE "contas_receber_baixas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conta_receber_id" UUID NOT NULL,
    "data_recebimento" DATE NOT NULL,
    "valor_recebido" DECIMAL(12,2) NOT NULL,
    "forma_pagamento_id" UUID,
    "conta_bancaria_id" UUID,
    "documento" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contas_receber_baixas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contas_receber_baixas_conta_receber_id_idx" ON "contas_receber_baixas"("conta_receber_id");

-- CreateIndex
CREATE INDEX "contas_receber_baixas_data_recebimento_idx" ON "contas_receber_baixas"("data_recebimento");

-- CreateIndex
CREATE INDEX "contas_receber_baixas_conta_bancaria_id_idx" ON "contas_receber_baixas"("conta_bancaria_id");

-- CreateIndex
CREATE INDEX "contas_receber_profissional_sacado_id_idx" ON "contas_receber"("profissional_sacado_id");

-- CreateIndex
CREATE INDEX "contas_receber_contrato_sala_id_idx" ON "contas_receber"("contrato_sala_id");

-- CreateIndex
CREATE INDEX "contas_receber_renegociado_de_id_idx" ON "contas_receber"("renegociado_de_id");

-- CreateIndex
CREATE INDEX "contas_receber_competencia_idx" ON "contas_receber"("competencia");

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_profissional_sacado_id_fkey" FOREIGN KEY ("profissional_sacado_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_contrato_sala_id_fkey" FOREIGN KEY ("contrato_sala_id") REFERENCES "contratos_sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_renegociado_de_id_fkey" FOREIGN KEY ("renegociado_de_id") REFERENCES "contas_receber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber_baixas" ADD CONSTRAINT "contas_receber_baixas_conta_receber_id_fkey" FOREIGN KEY ("conta_receber_id") REFERENCES "contas_receber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber_baixas" ADD CONSTRAINT "contas_receber_baixas_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber_baixas" ADD CONSTRAINT "contas_receber_baixas_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (issue #165): cada conta já Recebida ganha uma baixa com o valor total, a data e a
-- conta bancária que já tinha, para o recebido continuar somando pelas baixas sem mudar o
-- histórico. Contas pendentes e canceladas ficam sem baixa.
INSERT INTO "contas_receber_baixas"
  ("conta_receber_id", "data_recebimento", "valor_recebido", "forma_pagamento_id", "conta_bancaria_id", "created_at")
SELECT "id", COALESCE("data_recebimento", "data_vencimento"), "valor", "forma_pagamento_id", "conta_bancaria_id", "updated_at"
FROM "contas_receber"
WHERE "status" = 'RECEBIDO' AND "deleted_at" IS NULL;
