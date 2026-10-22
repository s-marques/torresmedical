-- CreateEnum
CREATE TYPE "contrato_sala_modalidade" AS ENUM ('MENSAL', 'TURNO', 'HORA');

-- CreateEnum
CREATE TYPE "contrato_sala_locatario_tipo" AS ENUM ('PROFISSIONAL', 'CLIENTE');

-- CreateEnum
CREATE TYPE "contrato_sala_tipo_receita" AS ENUM ('FIXO', 'VARIAVEL', 'MISTO');

-- CreateEnum
CREATE TYPE "contrato_sala_indice_reajuste" AS ENUM ('NENHUM', 'IGPM', 'IPCA', 'INPC', 'LIVRE_NEGOCIACAO');

-- CreateEnum
CREATE TYPE "contrato_sala_status" AS ENUM ('ATIVO', 'CANCELADO', 'ENCERRADO');

-- CreateTable
CREATE TABLE "contratos_sala" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sala_id" UUID NOT NULL,
    "modalidade" "contrato_sala_modalidade" NOT NULL,
    "locatario_tipo" "contrato_sala_locatario_tipo" NOT NULL,
    "profissional_id" UUID,
    "paciente_id" UUID,
    "especialidade" TEXT,
    "valor_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantidade_mensal" DECIMAL(8,2),
    "permuta" BOOLEAN NOT NULL DEFAULT false,
    "tipo_receita" "contrato_sala_tipo_receita" NOT NULL DEFAULT 'FIXO',
    "dia_vencimento" INTEGER NOT NULL DEFAULT 10,
    "forma_pagamento_id" UUID,
    "indice_reajuste" "contrato_sala_indice_reajuste" NOT NULL DEFAULT 'NENHUM',
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "permite_indicacao" BOOLEAN NOT NULL DEFAULT true,
    "participa_eventos" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "status" "contrato_sala_status" NOT NULL DEFAULT 'ATIVO',
    "pdf_arquivo_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contratos_sala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos_sala_dias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contrato_id" UUID NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,

    CONSTRAINT "contratos_sala_dias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_sala_sala_id_idx" ON "contratos_sala"("sala_id");

-- CreateIndex
CREATE INDEX "contratos_sala_profissional_id_idx" ON "contratos_sala"("profissional_id");

-- CreateIndex
CREATE INDEX "contratos_sala_paciente_id_idx" ON "contratos_sala"("paciente_id");

-- CreateIndex
CREATE INDEX "contratos_sala_status_idx" ON "contratos_sala"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_sala_dias_contrato_id_dia_semana_key" ON "contratos_sala_dias"("contrato_id", "dia_semana");

-- AddForeignKey
ALTER TABLE "contratos_sala" ADD CONSTRAINT "contratos_sala_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_sala" ADD CONSTRAINT "contratos_sala_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_sala_dias" ADD CONSTRAINT "contratos_sala_dias_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos_sala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
