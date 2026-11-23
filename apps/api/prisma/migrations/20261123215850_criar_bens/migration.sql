-- CreateEnum
CREATE TYPE "bem_tipo" AS ENUM ('AUTOMOVEL', 'IMOVEL_URBANO', 'IMOVEL_RURAL', 'BEM_MOVEL');

-- CreateTable
CREATE TABLE "bens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID,
    "descricao" TEXT NOT NULL,
    "tipo" "bem_tipo" NOT NULL DEFAULT 'AUTOMOVEL',
    "valor_compra" DECIMAL(12,2),
    "valor_atual" DECIMAL(12,2),
    "data_aquisicao" DATE,
    "marca" TEXT,
    "modelo" TEXT,
    "ano" INTEGER,
    "placa" TEXT,
    "renavam" TEXT,
    "financiado" BOOLEAN NOT NULL DEFAULT false,
    "possui_seguro" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "bens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bens_descricao_idx" ON "bens"("descricao");

-- CreateIndex
CREATE INDEX "bens_tipo_idx" ON "bens"("tipo");
