-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "profissional_id" UUID;

-- CreateIndex
CREATE INDEX "negocios_profissional_id_idx" ON "negocios"("profissional_id");
