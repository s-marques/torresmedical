-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN     "chegada_em" TIMESTAMPTZ(3),
ADD COLUMN     "entrada_em" TIMESTAMPTZ(3),
ADD COLUMN     "finalizado_em" TIMESTAMPTZ(3);
