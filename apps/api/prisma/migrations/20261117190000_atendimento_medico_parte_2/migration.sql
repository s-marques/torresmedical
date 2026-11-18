-- CreateTable
CREATE TABLE "agendamento_recebimentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agendamento_id" UUID NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "forma_pagamento_id" UUID NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agendamento_recebimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atendimento_receitas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "atendimento_id" UUID NOT NULL,
    "tipo" "evolucao_tipo" NOT NULL DEFAULT 'EVOLUCAO',
    "controlada" BOOLEAN NOT NULL DEFAULT false,
    "validade_dias" INTEGER NOT NULL DEFAULT 30,
    "texto" TEXT NOT NULL,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "atendimento_receitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agendamento_recebimentos_agendamento_id_idx" ON "agendamento_recebimentos"("agendamento_id");

-- CreateIndex
CREATE INDEX "agendamento_recebimentos_forma_pagamento_id_idx" ON "agendamento_recebimentos"("forma_pagamento_id");

-- CreateIndex
CREATE INDEX "atendimento_receitas_atendimento_id_idx" ON "atendimento_receitas"("atendimento_id");

-- AddForeignKey
ALTER TABLE "agendamento_recebimentos" ADD CONSTRAINT "agendamento_recebimentos_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento_recebimentos" ADD CONSTRAINT "agendamento_recebimentos_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "formas_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento_receitas" ADD CONSTRAINT "atendimento_receitas_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
