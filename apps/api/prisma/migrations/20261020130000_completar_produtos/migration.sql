-- CreateEnum
CREATE TYPE "produto_tipo" AS ENUM ('PRODUTO', 'REVENDA', 'USO_CONSUMO', 'SERVICO');

-- AlterTable: o tipo passa a ter 4 valores; as linhas existentes mantêm PRODUTO/SERVICO.
ALTER TABLE "produtos"
  ALTER COLUMN "tipo" TYPE "produto_tipo" USING ("tipo"::text::"produto_tipo");

-- O antigo "codigo" (SKU ou código de barras) vira o SKU.
DROP INDEX "produtos_codigo_idx";
ALTER TABLE "produtos" RENAME COLUMN "codigo" TO "sku";

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "codigo_barras" TEXT,
ADD COLUMN     "controla_estoque" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "estoque_atual" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "estoque_minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "marca" TEXT,
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "preco_custo" DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "produtos_sku_idx" ON "produtos"("sku");

-- CreateIndex
CREATE INDEX "produtos_codigo_barras_idx" ON "produtos"("codigo_barras");
