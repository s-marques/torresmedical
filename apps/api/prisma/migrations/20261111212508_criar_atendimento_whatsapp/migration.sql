-- CreateEnum
CREATE TYPE "canal_whatsapp_tipo" AS ENUM ('DINASTI_API', 'CLOUD_API');

-- CreateEnum
CREATE TYPE "canal_whatsapp_status" AS ENUM ('CONECTADO', 'DESCONECTADO');

-- CreateEnum
CREATE TYPE "conversa_whatsapp_status" AS ENUM ('BOT', 'AGUARDANDO', 'EM_ATENDIMENTO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "mensagem_whatsapp_direcao" AS ENUM ('RECEBIDA', 'ENVIADA');

-- CreateTable
CREATE TABLE "canais_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "canal_whatsapp_tipo" NOT NULL DEFAULT 'DINASTI_API',
    "status" "canal_whatsapp_status" NOT NULL DEFAULT 'DESCONECTADO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "canais_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contatos_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT,
    "telefone" TEXT NOT NULL,
    "paciente_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contatos_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contato_id" UUID NOT NULL,
    "canal_id" UUID NOT NULL,
    "status" "conversa_whatsapp_status" NOT NULL DEFAULT 'AGUARDANDO',
    "nao_lidas" INTEGER NOT NULL DEFAULT 0,
    "ultima_mensagem_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversas_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversa_id" UUID NOT NULL,
    "direcao" "mensagem_whatsapp_direcao" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "enviada_em" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags_atendimento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tags_atendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas_tags" (
    "conversa_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversas_tags_pkey" PRIMARY KEY ("conversa_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contatos_whatsapp_telefone_key" ON "contatos_whatsapp"("telefone");

-- CreateIndex
CREATE INDEX "contatos_whatsapp_paciente_id_idx" ON "contatos_whatsapp"("paciente_id");

-- CreateIndex
CREATE INDEX "conversas_whatsapp_canal_id_status_ultima_mensagem_em_idx" ON "conversas_whatsapp"("canal_id", "status", "ultima_mensagem_em");

-- CreateIndex
CREATE INDEX "conversas_whatsapp_contato_id_idx" ON "conversas_whatsapp"("contato_id");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_conversa_id_enviada_em_idx" ON "mensagens_whatsapp"("conversa_id", "enviada_em");

-- CreateIndex
CREATE INDEX "conversas_tags_tag_id_idx" ON "conversas_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "contatos_whatsapp" ADD CONSTRAINT "contatos_whatsapp_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_whatsapp" ADD CONSTRAINT "conversas_whatsapp_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_whatsapp" ADD CONSTRAINT "conversas_whatsapp_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_tags" ADD CONSTRAINT "conversas_tags_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_tags" ADD CONSTRAINT "conversas_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags_atendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
