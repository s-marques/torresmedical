-- CreateEnum
CREATE TYPE "evolucao_tipo" AS ENUM ('EVOLUCAO', 'DIAGNOSTICO', 'PRESCRICAO', 'OBSERVACAO', 'ENCAMINHAMENTO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgendamentoStatus" ADD VALUE 'AGUARDANDO';
ALTER TYPE "AgendamentoStatus" ADD VALUE 'EM_ATENDIMENTO';

-- AlterTable
ALTER TABLE "atendimentos" ADD COLUMN     "agendamento_id" UUID,
ADD COLUMN     "finalizado_em" TIMESTAMPTZ(3),
ADD COLUMN     "iniciado_em" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "atendimento_evolucoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "atendimento_id" UUID NOT NULL,
    "tipo" "evolucao_tipo" NOT NULL DEFAULT 'EVOLUCAO',
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "atendimento_evolucoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atendimento_evolucoes_atendimento_id_idx" ON "atendimento_evolucoes"("atendimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "atendimentos_agendamento_id_key" ON "atendimentos"("agendamento_id");

-- AddForeignKey
ALTER TABLE "atendimento_evolucoes" ADD CONSTRAINT "atendimento_evolucoes_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

