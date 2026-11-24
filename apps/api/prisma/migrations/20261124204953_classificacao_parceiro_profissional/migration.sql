-- CreateEnum
CREATE TYPE "classificacao_parceiro" AS ENUM ('NOVO', 'ATIVO', 'ESTRATEGICO', 'EM_EXPANSAO', 'EM_RISCO', 'INATIVO');

-- CreateEnum
CREATE TYPE "classificacao_origem" AS ENUM ('AUTOMATICO', 'MANUAL');

-- AlterTable
ALTER TABLE "profissionais" ADD COLUMN     "classificacao" "classificacao_parceiro",
ADD COLUMN     "classificacao_em" TIMESTAMPTZ(3),
ADD COLUMN     "classificacao_motivo" TEXT,
ADD COLUMN     "classificacao_parametros" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "estrategico" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "profissionais_classificacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "classificacao_anterior" "classificacao_parceiro",
    "classificacao" "classificacao_parceiro" NOT NULL,
    "motivo" TEXT NOT NULL,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "origem" "classificacao_origem" NOT NULL,
    "usuario_id" TEXT,
    "referencia" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profissionais_classificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profissionais_classificacoes_profissional_id_created_at_idx" ON "profissionais_classificacoes"("profissional_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "profissionais_classificacao_idx" ON "profissionais"("classificacao");

-- AddForeignKey
ALTER TABLE "profissionais_classificacoes" ADD CONSTRAINT "profissionais_classificacoes_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
