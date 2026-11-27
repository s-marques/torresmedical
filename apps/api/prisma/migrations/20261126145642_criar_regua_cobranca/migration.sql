-- CreateEnum
CREATE TYPE "marco_cobranca" AS ENUM ('ANTES_3_DIAS', 'NO_VENCIMENTO', 'DEPOIS_3_DIAS', 'DEPOIS_7_DIAS');

-- CreateEnum
CREATE TYPE "cobranca_envio_status" AS ENUM ('ENVIADO', 'FALHA');

-- CreateTable
CREATE TABLE "regua_cobranca" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "marco" "marco_cobranca" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "enviar_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "alerta_interno" BOOLEAN NOT NULL DEFAULT true,
    "mensagem" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regua_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobrancas_envios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conta_receber_id" UUID NOT NULL,
    "marco" "marco_cobranca" NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "status" "cobranca_envio_status" NOT NULL,
    "erro" TEXT,
    "mensagem_whatsapp_id" UUID,
    "vencimento" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobrancas_envios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regua_cobranca_marco_key" ON "regua_cobranca"("marco");

-- CreateIndex
CREATE INDEX "cobrancas_envios_created_at_idx" ON "cobrancas_envios"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_envios_conta_receber_id_marco_key" ON "cobrancas_envios"("conta_receber_id", "marco");

-- AddForeignKey
ALTER TABLE "cobrancas_envios" ADD CONSTRAINT "cobrancas_envios_conta_receber_id_fkey" FOREIGN KEY ("conta_receber_id") REFERENCES "contas_receber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Régua padrão: os quatro marcos do requisito (R §18), com texto inicial a confirmar com o cliente.
INSERT INTO "regua_cobranca" ("marco", "mensagem", "updated_at") VALUES
  ('ANTES_3_DIAS', 'Olá, {nome}! Lembramos que o título {titulo}, no valor de {valor}, vence em {vencimento}.', CURRENT_TIMESTAMP),
  ('NO_VENCIMENTO', 'Olá, {nome}! O título {titulo}, no valor de {valor}, vence hoje ({vencimento}). Qualquer dúvida, fale conosco.', CURRENT_TIMESTAMP),
  ('DEPOIS_3_DIAS', 'Olá, {nome}! Não identificamos o pagamento do título {titulo}, de {valor}, vencido em {vencimento}. Se já pagou, desconsidere.', CURRENT_TIMESTAMP),
  ('DEPOIS_7_DIAS', 'Olá, {nome}! O título {titulo}, de {valor}, está vencido desde {vencimento}. Entre em contato para regularizar.', CURRENT_TIMESTAMP);
