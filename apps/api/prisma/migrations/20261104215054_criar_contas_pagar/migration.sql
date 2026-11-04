-- CreateEnum
CREATE TYPE "conta_pagar_beneficiario_tipo" AS ENUM ('FORNECEDOR', 'FUNCIONARIO');

-- CreateEnum
CREATE TYPE "conta_pagar_status" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO');

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "banco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_pagar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "beneficiario_tipo" "conta_pagar_beneficiario_tipo" NOT NULL DEFAULT 'FORNECEDOR',
    "fornecedor_id" UUID,
    "funcionario_id" UUID,
    "valor" DECIMAL(12,2) NOT NULL,
    "data_vencimento" DATE NOT NULL,
    "forma_pagamento_id" UUID,
    "plano_conta_id" UUID,
    "documento" TEXT,
    "total_parcelas" INTEGER NOT NULL DEFAULT 1,
    "status" "conta_pagar_status" NOT NULL DEFAULT 'PENDENTE',
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contas_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_pagar_baixas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conta_pagar_id" UUID NOT NULL,
    "data_pagamento" DATE NOT NULL,
    "valor_pago" DECIMAL(12,2) NOT NULL,
    "juros" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "forma_pagamento_id" UUID,
    "conta_bancaria_id" UUID,
    "documento" TEXT,
    "observacoes" TEXT,
    "comprovante_arquivo_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contas_pagar_baixas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contas_pagar_numero_key" ON "contas_pagar"("numero");

-- CreateIndex
CREATE INDEX "contas_pagar_fornecedor_id_idx" ON "contas_pagar"("fornecedor_id");

-- CreateIndex
CREATE INDEX "contas_pagar_funcionario_id_idx" ON "contas_pagar"("funcionario_id");

-- CreateIndex
CREATE INDEX "contas_pagar_forma_pagamento_id_idx" ON "contas_pagar"("forma_pagamento_id");

-- CreateIndex
CREATE INDEX "contas_pagar_plano_conta_id_idx" ON "contas_pagar"("plano_conta_id");

-- CreateIndex
CREATE INDEX "contas_pagar_status_idx" ON "contas_pagar"("status");

-- CreateIndex
CREATE INDEX "contas_pagar_data_vencimento_idx" ON "contas_pagar"("data_vencimento");

-- CreateIndex
CREATE INDEX "contas_pagar_baixas_conta_pagar_id_idx" ON "contas_pagar_baixas"("conta_pagar_id");

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_plano_conta_id_fkey" FOREIGN KEY ("plano_conta_id") REFERENCES "planos_contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar_baixas" ADD CONSTRAINT "contas_pagar_baixas_conta_pagar_id_fkey" FOREIGN KEY ("conta_pagar_id") REFERENCES "contas_pagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar_baixas" ADD CONSTRAINT "contas_pagar_baixas_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar_baixas" ADD CONSTRAINT "contas_pagar_baixas_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
