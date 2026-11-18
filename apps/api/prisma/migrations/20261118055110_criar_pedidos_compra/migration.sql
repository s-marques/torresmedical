-- CreateEnum
CREATE TYPE "pedido_compra_status" AS ENUM ('EM_TRANSITO', 'RECEBIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "pedidos_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fornecedor_id" UUID NOT NULL,
    "numero_nf" TEXT,
    "data_pedido" DATE NOT NULL,
    "data_previsao" DATE,
    "valor_total" DECIMAL(12,2) NOT NULL,
    "valor_total_informado" BOOLEAN NOT NULL DEFAULT false,
    "status" "pedido_compra_status" NOT NULL DEFAULT 'EM_TRANSITO',
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pedidos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_compra_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_compra_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_compra_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedidos_compra_fornecedor_id_idx" ON "pedidos_compra"("fornecedor_id");

-- CreateIndex
CREATE INDEX "pedidos_compra_status_idx" ON "pedidos_compra"("status");

-- CreateIndex
CREATE INDEX "pedidos_compra_data_pedido_idx" ON "pedidos_compra"("data_pedido");

-- CreateIndex
CREATE INDEX "pedido_compra_itens_pedido_compra_id_idx" ON "pedido_compra_itens"("pedido_compra_id");

-- CreateIndex
CREATE INDEX "pedido_compra_itens_produto_id_idx" ON "pedido_compra_itens"("produto_id");

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_compra_itens" ADD CONSTRAINT "pedido_compra_itens_pedido_compra_id_fkey" FOREIGN KEY ("pedido_compra_id") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_compra_itens" ADD CONSTRAINT "pedido_compra_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
