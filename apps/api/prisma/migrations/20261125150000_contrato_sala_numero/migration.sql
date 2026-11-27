-- AlterTable
ALTER TABLE "contratos_sala" ADD COLUMN     "numero" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "contratos_sala_numero_key" ON "contratos_sala"("numero");

