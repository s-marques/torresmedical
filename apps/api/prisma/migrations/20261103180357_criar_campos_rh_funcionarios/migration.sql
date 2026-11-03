-- CreateEnum
CREATE TYPE "tipo_contrato" AS ENUM ('CLT', 'PJ', 'ESTAGIO', 'TEMPORARIO', 'AUTONOMO');

-- CreateEnum
CREATE TYPE "status_comissao" AS ENUM ('PENDENTE', 'PAGA');

-- AlterTable
ALTER TABLE "cargos" ADD COLUMN     "departamento" TEXT,
ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "salario_base" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "funcionarios" ADD COLUMN     "agencia" TEXT,
ADD COLUMN     "banco" TEXT,
ADD COLUMN     "carga_horaria" INTEGER,
ADD COLUMN     "conta" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "ctps" TEXT,
ADD COLUMN     "data_admissao" DATE,
ADD COLUMN     "data_nascimento" DATE,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "pis" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "salario" DECIMAL(12,2),
ADD COLUMN     "tipo_contrato" "tipo_contrato";

-- CreateTable
CREATE TABLE "comissoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "funcionario_id" UUID NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "data_referencia" DATE NOT NULL,
    "descricao" TEXT,
    "status" "status_comissao" NOT NULL DEFAULT 'PENDENTE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comissoes_funcionario_id_idx" ON "comissoes"("funcionario_id");

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
