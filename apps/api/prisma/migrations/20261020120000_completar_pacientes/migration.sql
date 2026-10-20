-- CreateEnum
CREATE TYPE "paciente_tipo" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "paciente_status" AS ENUM ('NOVO', 'ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "paciente_sexo" AS ENUM ('FEMININO', 'MASCULINO', 'OUTRO');

-- AlterTable
ALTER TABLE "pacientes" ADD COLUMN     "aceita_campanhas_whatsapp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "celular" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "codigo_ibge" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "data_nascimento" DATE,
ADD COLUMN     "inscricao_estadual" TEXT,
ADD COLUMN     "logradouro" TEXT,
ADD COLUMN     "menor_idade" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nome_fantasia" TEXT,
ADD COLUMN     "nome_social" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "profissao" TEXT,
ADD COLUMN     "razao_social" TEXT,
ADD COLUMN     "representante_celular" TEXT,
ADD COLUMN     "representante_nome" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "sexo" "paciente_sexo",
ADD COLUMN     "status" "paciente_status" NOT NULL DEFAULT 'ATIVO',
ADD COLUMN     "tipo" "paciente_tipo" NOT NULL DEFAULT 'PF',
ADD COLUMN     "uf" TEXT;

-- Preserva o Ativo/Inativo anterior no novo status antes de remover a coluna.
UPDATE "pacientes" SET "status" = 'INATIVO' WHERE "ativo" = false;

ALTER TABLE "pacientes" DROP COLUMN "ativo";

-- CreateIndex
CREATE INDEX "pacientes_status_idx" ON "pacientes"("status");

