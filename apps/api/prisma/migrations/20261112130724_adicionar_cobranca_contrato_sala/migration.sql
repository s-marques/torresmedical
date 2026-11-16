-- CreateTable
CREATE TABLE "contratos_sala_cobranca" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contrato_sala_id" UUID NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "conta_receber_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratos_sala_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_sala_cobranca_contrato_sala_id_idx" ON "contratos_sala_cobranca"("contrato_sala_id");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_sala_cobranca_contrato_sala_id_competencia_key" ON "contratos_sala_cobranca"("contrato_sala_id", "competencia");

-- AddForeignKey
ALTER TABLE "contratos_sala_cobranca" ADD CONSTRAINT "contratos_sala_cobranca_contrato_sala_id_fkey" FOREIGN KEY ("contrato_sala_id") REFERENCES "contratos_sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
