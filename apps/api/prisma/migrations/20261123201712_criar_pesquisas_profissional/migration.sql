-- CreateEnum
CREATE TYPE "pesquisa_profissional_status" AS ENUM ('ENVIADA', 'RESPONDIDA', 'FALHA');

-- CreateEnum
CREATE TYPE "pesquisa_profissional_tipo" AS ENUM ('TRINTA_DIAS', 'PERIODICA');

-- CreateTable
CREATE TABLE "pesquisas_profissional" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "ciclo" INTEGER NOT NULL,
    "tipo" "pesquisa_profissional_tipo" NOT NULL,
    "status" "pesquisa_profissional_status" NOT NULL,
    "erro" TEXT,
    "token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "nota_estrutura" INTEGER,
    "nota_recepcao" INTEGER,
    "nota_agenda" INTEGER,
    "nota_atendimento" INTEGER,
    "nps" INTEGER,
    "comentario" TEXT,
    "mensagem_whatsapp_id" UUID,
    "enviada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondida_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pesquisas_profissional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao_pesquisa_profissional" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "periodicidade_meses" INTEGER NOT NULL DEFAULT 6,
    "mensagem" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracao_pesquisa_profissional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_profissional_token_hash_key" ON "pesquisas_profissional"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_profissional_mensagem_whatsapp_id_key" ON "pesquisas_profissional"("mensagem_whatsapp_id");

-- CreateIndex
CREATE INDEX "pesquisas_profissional_enviada_em_idx" ON "pesquisas_profissional"("enviada_em");

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_profissional_profissional_id_ciclo_key" ON "pesquisas_profissional"("profissional_id", "ciclo");

-- AddForeignKey
ALTER TABLE "pesquisas_profissional" ADD CONSTRAINT "pesquisas_profissional_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisas_profissional" ADD CONSTRAINT "pesquisas_profissional_mensagem_whatsapp_id_fkey" FOREIGN KEY ("mensagem_whatsapp_id") REFERENCES "mensagens_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- As estrelas vão de 1 a 5 e o NPS de 0 a 10; só existem em pesquisa respondida.
ALTER TABLE "pesquisas_profissional" ADD CONSTRAINT "pesquisas_profissional_notas_check" CHECK (
    ("nota_estrutura" IS NULL OR "nota_estrutura" BETWEEN 1 AND 5)
    AND ("nota_recepcao" IS NULL OR "nota_recepcao" BETWEEN 1 AND 5)
    AND ("nota_agenda" IS NULL OR "nota_agenda" BETWEEN 1 AND 5)
    AND ("nota_atendimento" IS NULL OR "nota_atendimento" BETWEEN 1 AND 5)
    AND ("nps" IS NULL OR "nps" BETWEEN 0 AND 10)
);
