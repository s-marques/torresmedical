-- CreateEnum
CREATE TYPE "movimentacao_estoque_tipo" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE');

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID NOT NULL,
    "tipo" "movimentacao_estoque_tipo" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "saldo_anterior" DECIMAL(12,3),
    "saldo_posterior" DECIMAL(12,3),
    "motivo" TEXT,
    "documento" TEXT,
    "custo_unitario" DECIMAL(12,2),
    "lote" TEXT,
    "validade" DATE,
    "fornecedor_id" UUID,
    "compra_id" UUID,
    "usuario_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_produto_id_created_at_idx" ON "movimentacoes_estoque"("produto_id", "created_at");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_created_at_idx" ON "movimentacoes_estoque"("created_at");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_tipo_idx" ON "movimentacoes_estoque"("tipo");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_compra_id_idx" ON "movimentacoes_estoque"("compra_id");

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Histórico: as compras já recebidas (e não excluídas) somaram no estoque antes desta tabela.
-- Gera a entrada de cada item de produto controlado, sem saldo anterior/posterior (desconhecidos).
INSERT INTO "movimentacoes_estoque"
    ("produto_id", "tipo", "quantidade", "motivo", "documento", "custo_unitario", "fornecedor_id", "compra_id", "created_at")
SELECT
    ci."produto_id",
    'ENTRADA',
    ci."quantidade",
    CASE WHEN c."numero_nf" IS NULL THEN 'Entrada por compra #' || c."numero" ELSE 'Entrada por compra NF ' || c."numero_nf" END,
    c."numero_nf",
    ci."valor_unitario",
    c."fornecedor_id",
    c."id",
    c."created_at"
FROM "compra_itens" ci
JOIN "compras" c ON c."id" = ci."compra_id"
JOIN "produtos" p ON p."id" = ci."produto_id"
WHERE c."status" = 'RECEBIDA' AND c."deleted_at" IS NULL AND p."controla_estoque" = true;
