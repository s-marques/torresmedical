-- CreateEnum
CREATE TYPE "compra_status" AS ENUM ('PENDENTE', 'RECEBIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "compras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "fornecedor_id" UUID NOT NULL,
    "numero_nf" TEXT,
    "serie_nf" TEXT,
    "data_emissao" DATE,
    "data_entrada" DATE NOT NULL,
    "frete" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valor_total" DECIMAL(12,2) NOT NULL,
    "status" "compra_status" NOT NULL DEFAULT 'RECEBIDA',
    "observacoes" TEXT,
    "arquivo_nf_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compra_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "plano_conta_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compra_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compras_numero_key" ON "compras"("numero");

-- CreateIndex
CREATE INDEX "compras_fornecedor_id_idx" ON "compras"("fornecedor_id");

-- CreateIndex
CREATE INDEX "compras_status_idx" ON "compras"("status");

-- CreateIndex
CREATE INDEX "compras_data_entrada_idx" ON "compras"("data_entrada");

-- CreateIndex
CREATE INDEX "compra_itens_compra_id_idx" ON "compra_itens"("compra_id");

-- CreateIndex
CREATE INDEX "compra_itens_produto_id_idx" ON "compra_itens"("produto_id");

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_itens" ADD CONSTRAINT "compra_itens_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_itens" ADD CONSTRAINT "compra_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
