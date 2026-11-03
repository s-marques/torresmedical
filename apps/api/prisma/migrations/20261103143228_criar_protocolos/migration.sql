-- CreateEnum
CREATE TYPE "protocolo_tipo" AS ENUM ('PROCEDIMENTO', 'PRODUTO');

-- CreateTable
CREATE TABLE "protocolos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" "protocolo_tipo" NOT NULL DEFAULT 'PROCEDIMENTO',
    "categoria" TEXT NOT NULL DEFAULT 'Geral',
    "profissional_id" UUID,
    "total_semanas" INTEGER NOT NULL DEFAULT 1,
    "valor_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "protocolos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocolo_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocolo_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "protocolo_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocolos_mae" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'Geral',
    "total_semanas" INTEGER NOT NULL DEFAULT 1,
    "valor_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descricao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "protocolos_mae_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocolo_mae_semanas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "protocolo_mae_id" UUID NOT NULL,
    "semana" INTEGER NOT NULL,
    "protocolo_id" UUID,
    "observacoes" TEXT,

    CONSTRAINT "protocolo_mae_semanas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protocolos_profissional_id_idx" ON "protocolos"("profissional_id");

-- CreateIndex
CREATE INDEX "protocolos_categoria_idx" ON "protocolos"("categoria");

-- CreateIndex
CREATE INDEX "protocolo_itens_produto_id_idx" ON "protocolo_itens"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocolo_itens_protocolo_id_produto_id_key" ON "protocolo_itens"("protocolo_id", "produto_id");

-- CreateIndex
CREATE INDEX "protocolos_mae_categoria_idx" ON "protocolos_mae"("categoria");

-- CreateIndex
CREATE INDEX "protocolo_mae_semanas_protocolo_id_idx" ON "protocolo_mae_semanas"("protocolo_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocolo_mae_semanas_protocolo_mae_id_semana_key" ON "protocolo_mae_semanas"("protocolo_mae_id", "semana");

-- AddForeignKey
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_itens" ADD CONSTRAINT "protocolo_itens_protocolo_id_fkey" FOREIGN KEY ("protocolo_id") REFERENCES "protocolos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_itens" ADD CONSTRAINT "protocolo_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_mae_semanas" ADD CONSTRAINT "protocolo_mae_semanas_protocolo_mae_id_fkey" FOREIGN KEY ("protocolo_mae_id") REFERENCES "protocolos_mae"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_mae_semanas" ADD CONSTRAINT "protocolo_mae_semanas_protocolo_id_fkey" FOREIGN KEY ("protocolo_id") REFERENCES "protocolos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
