-- CreateEnum
CREATE TYPE "conta_receber_status" AS ENUM ('PENDENTE', 'RECEBIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "contas_receber" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "paciente_id" UUID,
    "valor" DECIMAL(12,2) NOT NULL,
    "data_vencimento" DATE NOT NULL,
    "forma_pagamento_id" UUID,
    "plano_conta_id" UUID,
    "documento" TEXT,
    "total_parcelas" INTEGER NOT NULL DEFAULT 1,
    "status" "conta_receber_status" NOT NULL DEFAULT 'PENDENTE',
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contas_receber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contas_receber_numero_key" ON "contas_receber"("numero");

-- CreateIndex
CREATE INDEX "contas_receber_paciente_id_idx" ON "contas_receber"("paciente_id");

-- CreateIndex
CREATE INDEX "contas_receber_forma_pagamento_id_idx" ON "contas_receber"("forma_pagamento_id");

-- CreateIndex
CREATE INDEX "contas_receber_plano_conta_id_idx" ON "contas_receber"("plano_conta_id");

-- CreateIndex
CREATE INDEX "contas_receber_status_idx" ON "contas_receber"("status");

-- CreateIndex
CREATE INDEX "contas_receber_data_vencimento_idx" ON "contas_receber"("data_vencimento");

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_plano_conta_id_fkey" FOREIGN KEY ("plano_conta_id") REFERENCES "planos_contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
