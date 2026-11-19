-- CreateEnum
CREATE TYPE "imovel_tipo" AS ENUM ('APARTAMENTO', 'SALA_COMERCIAL', 'TERRENO', 'CASA', 'GALPAO');

-- CreateTable
CREATE TABLE "imoveis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "descricao" TEXT NOT NULL,
    "tipo" "imovel_tipo" NOT NULL DEFAULT 'APARTAMENTO',
    "endereco" TEXT,
    "matricula" TEXT,
    "valor_compra" DECIMAL(12,2),
    "data_compra" DATE,
    "iptu_anual" DECIMAL(12,2),
    "itbi_pago" DECIMAL(12,2),
    "banco" TEXT,
    "financiamento_parcela" DECIMAL(12,2),
    "saldo_devedor" DECIMAL(12,2),
    "vencimento_financiamento" DATE,
    "condominio" DECIMAL(12,2),
    "conta_luz" DECIMAL(12,2),
    "conta_agua" DECIMAL(12,2),
    "internet" DECIMAL(12,2),
    "seguro" DECIMAL(12,2),
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "imoveis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imoveis_descricao_idx" ON "imoveis"("descricao");
