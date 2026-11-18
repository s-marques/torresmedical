-- CreateEnum
CREATE TYPE "conta_bancaria_tipo" AS ENUM ('CAIXA', 'CORRENTE', 'POUPANCA', 'INVESTIMENTO');

-- AlterTable
ALTER TABLE "contas_receber" ADD COLUMN     "conta_bancaria_id" UUID,
ADD COLUMN     "data_recebimento" DATE;

-- AlterTable
ALTER TABLE "contas_bancarias" ADD COLUMN     "agencia" TEXT,
ADD COLUMN     "conta" TEXT,
ADD COLUMN     "data_saldo_inicial" DATE,
ADD COLUMN     "saldo_inicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" "conta_bancaria_tipo" NOT NULL DEFAULT 'CORRENTE';

-- CreateIndex
CREATE INDEX "contas_receber_conta_bancaria_id_idx" ON "contas_receber"("conta_bancaria_id");

-- CreateIndex
CREATE INDEX "contas_receber_data_recebimento_idx" ON "contas_receber"("data_recebimento");

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contas já recebidas antes desta migration: a data de recebimento passa a ser a da última
-- alteração (quando o status foi trocado para Recebido), para entrarem no período da Conciliação.
UPDATE "contas_receber" SET "data_recebimento" = ("updated_at" AT TIME ZONE 'UTC')::date
WHERE "status" = 'RECEBIDO' AND "data_recebimento" IS NULL;
