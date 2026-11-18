-- CreateEnum
CREATE TYPE "escopo_dados" AS ENUM ('TODOS', 'PROFISSIONAIS_VINCULADOS');

-- AlterTable
ALTER TABLE "perfis" ADD COLUMN     "escopo_dados" "escopo_dados" NOT NULL DEFAULT 'TODOS';

-- CreateTable
CREATE TABLE "usuarios_profissionais" (
    "usuario_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,

    CONSTRAINT "usuarios_profissionais_pkey" PRIMARY KEY ("usuario_id","profissional_id")
);

-- CreateIndex
CREATE INDEX "usuarios_profissionais_profissional_id_idx" ON "usuarios_profissionais"("profissional_id");

-- AddForeignKey
ALTER TABLE "usuarios_profissionais" ADD CONSTRAINT "usuarios_profissionais_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_profissionais" ADD CONSTRAINT "usuarios_profissionais_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
