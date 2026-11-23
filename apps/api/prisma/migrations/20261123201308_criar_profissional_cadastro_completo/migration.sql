-- CreateEnum
CREATE TYPE "profissional_profissao" AS ENUM ('MEDICO', 'PSICOLOGO', 'NUTRICIONISTA', 'FISIOTERAPEUTA', 'BIOMEDICO', 'OUTRA');

-- AlterTable
ALTER TABLE "profissionais" ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "profissao" "profissional_profissao",
ADD COLUMN     "subespecialidade" TEXT;

-- CreateTable
CREATE TABLE "profissionais_rqe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "especialidade_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profissionais_rqe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissionais_contatos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profissionais_contatos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profissionais_rqe_especialidade_id_idx" ON "profissionais_rqe"("especialidade_id");

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_rqe_profissional_id_especialidade_id_key" ON "profissionais_rqe"("profissional_id", "especialidade_id");

-- CreateIndex
CREATE INDEX "profissionais_contatos_profissional_id_idx" ON "profissionais_contatos"("profissional_id");

-- AddForeignKey
ALTER TABLE "profissionais_rqe" ADD CONSTRAINT "profissionais_rqe_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais_rqe" ADD CONSTRAINT "profissionais_rqe_especialidade_id_fkey" FOREIGN KEY ("especialidade_id") REFERENCES "especialidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais_contatos" ADD CONSTRAINT "profissionais_contatos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
