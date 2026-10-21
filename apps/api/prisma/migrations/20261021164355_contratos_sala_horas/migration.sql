-- CreateTable
CREATE TABLE "contratos_sala_horas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contrato_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "entrada" TEXT NOT NULL,
    "saida" TEXT NOT NULL,
    "observacao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratos_sala_horas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_sala_horas_contrato_id_data_idx" ON "contratos_sala_horas"("contrato_id", "data");

-- AddForeignKey
ALTER TABLE "contratos_sala_horas" ADD CONSTRAINT "contratos_sala_horas_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos_sala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
