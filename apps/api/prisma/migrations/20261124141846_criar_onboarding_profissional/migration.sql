-- AlterEnum
ALTER TYPE "contrato_sala_status" ADD VALUE 'AGUARDANDO_ASSINATURA';

-- AlterTable
ALTER TABLE "contratos_sala" ADD COLUMN     "assinado_em" DATE;

-- CreateTable
CREATE TABLE "profissionais_onboarding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "contrato_sala_id" UUID NOT NULL,
    "iniciado_em" DATE NOT NULL,
    "recepcao_orientada_em" TIMESTAMPTZ(3),
    "recepcao_orientada_por_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profissionais_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_onboarding_profissional_id_key" ON "profissionais_onboarding"("profissional_id");

-- CreateIndex
CREATE INDEX "profissionais_onboarding_contrato_sala_id_idx" ON "profissionais_onboarding"("contrato_sala_id");

-- AddForeignKey
ALTER TABLE "profissionais_onboarding" ADD CONSTRAINT "profissionais_onboarding_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais_onboarding" ADD CONSTRAINT "profissionais_onboarding_contrato_sala_id_fkey" FOREIGN KEY ("contrato_sala_id") REFERENCES "contratos_sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
