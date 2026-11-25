-- CreateEnum
CREATE TYPE "veiculo_tipo" AS ENUM ('CARRO', 'MOTO', 'UTILITARIO');

-- CreateEnum
CREATE TYPE "veiculo_uso" AS ENUM ('CLINICA', 'PESSOAL', 'MISTO');

-- CreateTable
CREATE TABLE "veiculos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "descricao" TEXT NOT NULL,
    "tipo" "veiculo_tipo" NOT NULL DEFAULT 'CARRO',
    "placa" TEXT,
    "renavam" TEXT,
    "chassi" TEXT,
    "ano" INTEGER,
    "cor" TEXT,
    "uso" "veiculo_uso" NOT NULL DEFAULT 'CLINICA',
    "valor_compra" DECIMAL(12,2),
    "data_compra" DATE,
    "ipva_anual" DECIMAL(12,2),
    "licenciamento" DECIMAL(12,2),
    "seguro_anual" DECIMAL(12,2),
    "vencimento_seguro" DATE,
    "banco" TEXT,
    "financiamento_parcela" DECIMAL(12,2),
    "saldo_devedor" DECIMAL(12,2),
    "vencimento_financiamento" DATE,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "veiculos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "veiculos_descricao_idx" ON "veiculos"("descricao");
