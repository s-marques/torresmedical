-- CreateEnum
CREATE TYPE "AgendamentoStatus" AS ENUM ('AGENDADO', 'CONFIRMADO', 'CHECK_IN', 'CANCELADO', 'REAGENDAR', 'ATENDIDO', 'FALTOU');

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "tipo_agendamento_id" UUID,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "duracao_minutos" INTEGER NOT NULL DEFAULT 30,
    "valor" DECIMAL(12,2),
    "convenio" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "status" "AgendamentoStatus" NOT NULL DEFAULT 'AGENDADO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agendamentos_numero_key" ON "agendamentos"("numero");

-- CreateIndex
CREATE INDEX "agendamentos_profissional_id_inicio_idx" ON "agendamentos"("profissional_id", "inicio");

-- CreateIndex
CREATE INDEX "agendamentos_inicio_idx" ON "agendamentos"("inicio");

-- CreateIndex
CREATE INDEX "agendamentos_paciente_id_idx" ON "agendamentos"("paciente_id");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tipo_agendamento_id_fkey" FOREIGN KEY ("tipo_agendamento_id") REFERENCES "tipos_agendamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
