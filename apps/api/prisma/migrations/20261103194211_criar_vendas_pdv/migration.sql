-- CreateEnum
CREATE TYPE "venda_status" AS ENUM ('ORCAMENTO_APROVADO', 'FINALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "venda_item_origem" AS ENUM ('PRODUTO', 'PROTOCOLO');

-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN     "forma_pagamento_id" UUID,
ADD COLUMN     "pago_em" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "vendas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "paciente_id" UUID,
    "forma_pagamento_id" UUID,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "venda_status" NOT NULL DEFAULT 'FINALIZADA',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venda_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venda_id" UUID NOT NULL,
    "origem" "venda_item_origem" NOT NULL,
    "origem_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "posicao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "venda_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendas_numero_key" ON "vendas"("numero");

-- CreateIndex
CREATE INDEX "vendas_paciente_id_idx" ON "vendas"("paciente_id");

-- CreateIndex
CREATE INDEX "vendas_forma_pagamento_id_idx" ON "vendas"("forma_pagamento_id");

-- CreateIndex
CREATE INDEX "vendas_status_idx" ON "vendas"("status");

-- CreateIndex
CREATE INDEX "vendas_created_at_idx" ON "vendas"("created_at");

-- CreateIndex
CREATE INDEX "venda_itens_venda_id_idx" ON "venda_itens"("venda_id");

-- CreateIndex
CREATE INDEX "agendamentos_forma_pagamento_id_idx" ON "agendamentos"("forma_pagamento_id");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
