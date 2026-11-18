-- CreateEnum
CREATE TYPE "pesquisa_nps_status" AS ENUM ('ENVIADA', 'RESPONDIDA', 'FALHA');

-- CreateTable
CREATE TABLE "pesquisas_nps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "atendimento_id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "status" "pesquisa_nps_status" NOT NULL,
    "erro" TEXT,
    "nota" INTEGER,
    "comentario" TEXT,
    "mensagem_whatsapp_id" UUID,
    "enviada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondida_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pesquisas_nps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_nps_atendimento_id_key" ON "pesquisas_nps"("atendimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_nps_mensagem_whatsapp_id_key" ON "pesquisas_nps"("mensagem_whatsapp_id");

-- CreateIndex
CREATE INDEX "pesquisas_nps_enviada_em_idx" ON "pesquisas_nps"("enviada_em");

-- CreateIndex
CREATE INDEX "pesquisas_nps_paciente_id_status_idx" ON "pesquisas_nps"("paciente_id", "status");

-- AddForeignKey
ALTER TABLE "pesquisas_nps" ADD CONSTRAINT "pesquisas_nps_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisas_nps" ADD CONSTRAINT "pesquisas_nps_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisas_nps" ADD CONSTRAINT "pesquisas_nps_mensagem_whatsapp_id_fkey" FOREIGN KEY ("mensagem_whatsapp_id") REFERENCES "mensagens_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A nota do NPS vai de 0 a 10 e só existe em pesquisa respondida.
ALTER TABLE "pesquisas_nps" ADD CONSTRAINT "pesquisas_nps_nota_check" CHECK ("nota" IS NULL OR ("nota" BETWEEN 0 AND 10));
