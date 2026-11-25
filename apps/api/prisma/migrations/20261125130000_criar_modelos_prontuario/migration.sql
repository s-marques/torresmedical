-- CreateEnum
CREATE TYPE "modelo_prontuario_profissao" AS ENUM ('MEDICO', 'PSICOLOGO', 'NUTRICIONISTA', 'FISIOTERAPEUTA', 'BIOMEDICO', 'OUTRA');

-- AlterTable
ALTER TABLE "atendimentos" ADD COLUMN     "modelo_versao_id" UUID,
ADD COLUMN     "respostas" JSONB;

-- CreateTable
CREATE TABLE "modelos_prontuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "profissao" "modelo_prontuario_profissao" NOT NULL,
    "especialidade" TEXT,
    "profissional_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao_atual" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "modelos_prontuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_prontuario_versoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modelo_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "secoes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelos_prontuario_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modelos_prontuario_profissional_id_idx" ON "modelos_prontuario"("profissional_id");

-- CreateIndex
CREATE INDEX "modelos_prontuario_profissao_idx" ON "modelos_prontuario"("profissao");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_prontuario_versoes_modelo_id_numero_key" ON "modelos_prontuario_versoes"("modelo_id", "numero");

-- CreateIndex
CREATE INDEX "atendimentos_modelo_versao_id_idx" ON "atendimentos"("modelo_versao_id");

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_modelo_versao_id_fkey" FOREIGN KEY ("modelo_versao_id") REFERENCES "modelos_prontuario_versoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelos_prontuario_versoes" ADD CONSTRAINT "modelos_prontuario_versoes_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "modelos_prontuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
