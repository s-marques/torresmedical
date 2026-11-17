-- CreateEnum
CREATE TYPE "campanha_tipo_envio" AS ENUM ('TEXTO');

-- CreateEnum
CREATE TYPE "campanha_filtro" AS ENUM ('TODOS', 'ANIVERSARIANTES_DIA', 'ORIGEM', 'COMPRA_RECENTE');

-- CreateEnum
CREATE TYPE "campanha_status" AS ENUM ('AGENDADA', 'ENVIANDO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "envio_campanha_status" AS ENUM ('PROGRAMADO', 'ENFILEIRADO', 'FALHA', 'CANCELADO');

-- AlterEnum
ALTER TYPE "mensagem_whatsapp_autor" ADD VALUE 'CAMPANHA';

-- CreateTable
CREATE TABLE "campanhas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo_envio" "campanha_tipo_envio" NOT NULL DEFAULT 'TEXTO',
    "canal_id" UUID NOT NULL,
    "filtro" "campanha_filtro" NOT NULL DEFAULT 'TODOS',
    "origem_cliente_id" UUID,
    "dias_compra" INTEGER,
    "quantidade" INTEGER,
    "intervalo_segundos" INTEGER NOT NULL DEFAULT 5,
    "agendada_para" TIMESTAMPTZ(3) NOT NULL,
    "mensagem" TEXT NOT NULL,
    "status" "campanha_status" NOT NULL DEFAULT 'AGENDADA',
    "iniciada_em" TIMESTAMPTZ(3),
    "concluida_em" TIMESTAMPTZ(3),
    "cancelada_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_automaticas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo_envio" "campanha_tipo_envio" NOT NULL DEFAULT 'TEXTO',
    "canal_id" UUID NOT NULL,
    "filtro" "campanha_filtro" NOT NULL DEFAULT 'TODOS',
    "origem_cliente_id" UUID,
    "dias_compra" INTEGER,
    "horario" TEXT NOT NULL,
    "dias_semana" INTEGER[],
    "mensagem" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ultima_execucao_dia" DATE,
    "ultimo_envio_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "mensagens_automaticas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_campanha" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campanha_id" UUID,
    "mensagem_automatica_id" UUID,
    "dia" DATE,
    "paciente_id" UUID NOT NULL,
    "programado_para" TIMESTAMPTZ(3) NOT NULL,
    "status" "envio_campanha_status" NOT NULL DEFAULT 'PROGRAMADO',
    "mensagem_whatsapp_id" UUID,
    "erro" TEXT,
    "enfileirado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envios_campanha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanhas_status_agendada_para_idx" ON "campanhas"("status", "agendada_para");

-- CreateIndex
CREATE INDEX "mensagens_automaticas_ativa_idx" ON "mensagens_automaticas"("ativa");

-- CreateIndex
CREATE UNIQUE INDEX "envios_campanha_mensagem_whatsapp_id_key" ON "envios_campanha"("mensagem_whatsapp_id");

-- CreateIndex
CREATE INDEX "envios_campanha_status_programado_para_idx" ON "envios_campanha"("status", "programado_para");

-- CreateIndex
CREATE INDEX "envios_campanha_paciente_id_idx" ON "envios_campanha"("paciente_id");

-- CreateIndex
CREATE UNIQUE INDEX "envios_campanha_campanha_id_paciente_id_key" ON "envios_campanha"("campanha_id", "paciente_id");

-- CreateIndex
CREATE UNIQUE INDEX "envios_campanha_mensagem_automatica_id_paciente_id_dia_key" ON "envios_campanha"("mensagem_automatica_id", "paciente_id", "dia");

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_origem_cliente_id_fkey" FOREIGN KEY ("origem_cliente_id") REFERENCES "origens_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_automaticas" ADD CONSTRAINT "mensagens_automaticas_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_automaticas" ADD CONSTRAINT "mensagens_automaticas_origem_cliente_id_fkey" FOREIGN KEY ("origem_cliente_id") REFERENCES "origens_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_campanha" ADD CONSTRAINT "envios_campanha_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_campanha" ADD CONSTRAINT "envios_campanha_mensagem_automatica_id_fkey" FOREIGN KEY ("mensagem_automatica_id") REFERENCES "mensagens_automaticas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_campanha" ADD CONSTRAINT "envios_campanha_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_campanha" ADD CONSTRAINT "envios_campanha_mensagem_whatsapp_id_fkey" FOREIGN KEY ("mensagem_whatsapp_id") REFERENCES "mensagens_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
