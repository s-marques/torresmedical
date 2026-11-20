-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN     "sala_id" UUID;

-- CreateIndex
CREATE INDEX "agendamentos_sala_id_inicio_idx" ON "agendamentos"("sala_id", "inicio");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
