-- CreateTable
CREATE TABLE "encaminhamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "origem_profissional_id" UUID NOT NULL,
    "destino_profissional_id" UUID NOT NULL,
    "especialidade_id" UUID,
    "data" DATE NOT NULL,
    "motivo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "encaminhamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "encaminhamentos_paciente_id_idx" ON "encaminhamentos"("paciente_id");

-- CreateIndex
CREATE INDEX "encaminhamentos_origem_profissional_id_idx" ON "encaminhamentos"("origem_profissional_id");

-- CreateIndex
CREATE INDEX "encaminhamentos_destino_profissional_id_idx" ON "encaminhamentos"("destino_profissional_id");

-- CreateIndex
CREATE INDEX "encaminhamentos_data_idx" ON "encaminhamentos"("data");
