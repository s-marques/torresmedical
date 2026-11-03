-- CreateEnum
CREATE TYPE "orcamento_status" AS ENUM ('PENDENTE', 'APROVADO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "orcamento_desconto_tipo" AS ENUM ('VALOR', 'PERCENTUAL');

-- CreateEnum
CREATE TYPE "orcamento_item_origem" AS ENUM ('SERVICO', 'PROTOCOLO', 'PROTOCOLO_MAE');

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "paciente_id" UUID,
    "forma_pagamento_id" UUID,
    "observacoes" TEXT,
    "desconto_tipo" "orcamento_desconto_tipo" NOT NULL DEFAULT 'VALOR',
    "desconto_valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "orcamento_status" NOT NULL DEFAULT 'PENDENTE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orcamento_id" UUID NOT NULL,
    "origem" "orcamento_item_origem" NOT NULL,
    "origem_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "posicao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "orcamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_numero_key" ON "orcamentos"("numero");

-- CreateIndex
CREATE INDEX "orcamentos_paciente_id_idx" ON "orcamentos"("paciente_id");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_created_at_idx" ON "orcamentos"("created_at");

-- CreateIndex
CREATE INDEX "orcamento_itens_orcamento_id_idx" ON "orcamento_itens"("orcamento_id");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
