-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "cargo" TEXT,
ADD COLUMN     "ver_dados_sensiveis" BOOLEAN NOT NULL DEFAULT false;
