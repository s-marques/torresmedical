-- AlterTable
ALTER TABLE "tipos_agendamento" ADD COLUMN     "permite_pacote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permite_procedimento" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soroterapia" BOOLEAN NOT NULL DEFAULT false;
