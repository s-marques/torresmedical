-- AlterEnum
ALTER TYPE "atividade_negocio_status" ADD VALUE 'CANCELADA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "atividade_negocio_tipo" ADD VALUE 'LIGACAO';
ALTER TYPE "atividade_negocio_tipo" ADD VALUE 'EMAIL';
ALTER TYPE "atividade_negocio_tipo" ADD VALUE 'REUNIAO';
ALTER TYPE "atividade_negocio_tipo" ADD VALUE 'WHATSAPP';
ALTER TYPE "atividade_negocio_tipo" ADD VALUE 'NOTA';

-- AlterTable
ALTER TABLE "atividades_negocio" ADD COLUMN     "cancelada_em" TIMESTAMPTZ(3),
ADD COLUMN     "descricao" TEXT,
ALTER COLUMN "negocio_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "atividades_negocio_status_data_hora_idx" ON "atividades_negocio"("status", "data_hora");
