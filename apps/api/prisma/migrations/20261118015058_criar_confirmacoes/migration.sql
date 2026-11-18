-- CreateEnum
CREATE TYPE "confirmacao_etapa" AS ENUM ('MSG1', 'MSG2', 'MSG3', 'LEMBRETE');

-- CreateEnum
CREATE TYPE "confirmacao_envio_status" AS ENUM ('ENVIADO', 'FALHA');

-- CreateTable
CREATE TABLE "configuracao_confirmacao" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "antecedencia_dias" INTEGER NOT NULL DEFAULT 1,
    "horario_lembrete" TEXT NOT NULL,
    "horario_msg1" TEXT NOT NULL,
    "horario_msg2" TEXT NOT NULL,
    "horario_msg3" TEXT NOT NULL,
    "horario_nao_confirmou" TEXT NOT NULL,
    "mensagem_criacao" TEXT NOT NULL,
    "mensagem_confirmada" TEXT NOT NULL,
    "mensagem_ja_confirmado" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracao_confirmacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_confirmacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo_agendamento_id" UUID NOT NULL,
    "msg1" TEXT NOT NULL,
    "msg2" TEXT NOT NULL,
    "msg3" TEXT NOT NULL,
    "lembrete_confirmado" TEXT NOT NULL,
    "lembrete_nao_confirmado" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "modelos_confirmacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_confirmacao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agendamento_id" UUID NOT NULL,
    "etapa" "confirmacao_etapa" NOT NULL,
    "status" "confirmacao_envio_status" NOT NULL,
    "erro" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "mensagem_whatsapp_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envios_confirmacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modelos_confirmacao_tipo_agendamento_id_key" ON "modelos_confirmacao"("tipo_agendamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "envios_confirmacao_mensagem_whatsapp_id_key" ON "envios_confirmacao"("mensagem_whatsapp_id");

-- CreateIndex
CREATE INDEX "envios_confirmacao_created_at_idx" ON "envios_confirmacao"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "envios_confirmacao_agendamento_id_etapa_key" ON "envios_confirmacao"("agendamento_id", "etapa");

-- AddForeignKey
ALTER TABLE "modelos_confirmacao" ADD CONSTRAINT "modelos_confirmacao_tipo_agendamento_id_fkey" FOREIGN KEY ("tipo_agendamento_id") REFERENCES "tipos_agendamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_confirmacao" ADD CONSTRAINT "envios_confirmacao_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_confirmacao" ADD CONSTRAINT "envios_confirmacao_mensagem_whatsapp_id_fkey" FOREIGN KEY ("mensagem_whatsapp_id") REFERENCES "mensagens_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
