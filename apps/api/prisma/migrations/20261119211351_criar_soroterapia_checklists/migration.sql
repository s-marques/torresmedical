-- CreateEnum
CREATE TYPE "soroterapia_checklist_status" AS ENUM ('EM_ANDAMENTO', 'FINALIZADO', 'SUSPENSO');

-- CreateTable
CREATE TABLE "soroterapia_checklists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agendamento_id" UUID,
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "protocolo_nome" TEXT NOT NULL,
    "sinais_vitais_inicio" TEXT,
    "status" "soroterapia_checklist_status" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "iniciado_em" TIMESTAMPTZ(3) NOT NULL,
    "finalizado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "soroterapia_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "soroterapia_checklists_status_iniciado_em_idx" ON "soroterapia_checklists"("status", "iniciado_em");

-- CreateIndex
CREATE INDEX "soroterapia_checklists_paciente_id_idx" ON "soroterapia_checklists"("paciente_id");

-- CreateIndex
CREATE INDEX "soroterapia_checklists_profissional_id_idx" ON "soroterapia_checklists"("profissional_id");

-- CreateIndex
CREATE INDEX "soroterapia_checklists_agendamento_id_idx" ON "soroterapia_checklists"("agendamento_id");
