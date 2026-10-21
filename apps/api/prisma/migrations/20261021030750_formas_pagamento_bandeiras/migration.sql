-- AlterTable
ALTER TABLE "formas_pagamento" ADD COLUMN     "max_parcelas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "movimenta_conta_bancaria" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "prazo_recebimento_dias" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "bandeiras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "icone" TEXT NOT NULL DEFAULT 'fa-credit-card',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "bandeiras_pkey" PRIMARY KEY ("id")
);
