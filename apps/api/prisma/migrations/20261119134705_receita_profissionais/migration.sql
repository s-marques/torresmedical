-- AlterTable
ALTER TABLE "contas_receber" ADD COLUMN     "profissional_id" UUID;

-- CreateIndex
CREATE INDEX "contas_receber_profissional_id_idx" ON "contas_receber"("profissional_id");

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
