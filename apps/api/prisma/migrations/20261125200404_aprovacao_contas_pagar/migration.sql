-- CreateEnum
CREATE TYPE "conta_pagar_aprovacao" AS ENUM ('LANCADA', 'APROVADA', 'RECUSADA');

-- AlterTable
ALTER TABLE "contas_pagar" ADD COLUMN     "aprovacao" "conta_pagar_aprovacao" NOT NULL DEFAULT 'LANCADA',
ADD COLUMN     "aprovado_em" TIMESTAMPTZ(3),
ADD COLUMN     "aprovado_por_id" UUID,
ADD COLUMN     "lancado_por_id" UUID,
ADD COLUMN     "motivo_recusa" TEXT,
ADD COLUMN     "recusado_em" TIMESTAMPTZ(3),
ADD COLUMN     "recusado_por_id" UUID;

-- CreateIndex
CREATE INDEX "contas_pagar_aprovacao_idx" ON "contas_pagar"("aprovacao");

-- Contas já lançadas antes da aprovação (issue #164) seguem valendo: ficam aprovadas, sem aprovador,
-- para não travar a baixa do que já existe. As contas novas nascem como LANCADA.
UPDATE "contas_pagar" SET "aprovacao" = 'APROVADA';
