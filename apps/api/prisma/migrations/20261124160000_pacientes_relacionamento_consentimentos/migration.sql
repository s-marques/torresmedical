-- CreateEnum
CREATE TYPE "paciente_canal_origem" AS ENUM ('WHATSAPP', 'TELEFONE', 'SITE', 'PRESENCIAL', 'REDES_SOCIAIS', 'OUTRO');

-- CreateEnum
CREATE TYPE "paciente_preferencia_comunicacao" AS ENUM ('WHATSAPP', 'TELEFONE', 'EMAIL', 'SEM_PREFERENCIA');

-- CreateEnum
CREATE TYPE "paciente_indicacao_tipo" AS ENUM ('PACIENTE', 'PROFISSIONAL', 'TEXTO');

-- CreateEnum
CREATE TYPE "consentimento_tipo" AS ENUM ('TRATAMENTO_DADOS', 'COMUNICACAO', 'CAMPANHAS');

-- CreateEnum
CREATE TYPE "consentimento_canal" AS ENUM ('PRESENCIAL', 'WHATSAPP', 'TELEFONE', 'EMAIL', 'SITE', 'OUTRO');

-- AlterTable
ALTER TABLE "pacientes" ADD COLUMN     "aceita_comunicacao" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canal_origem" "paciente_canal_origem",
ADD COLUMN     "especialidade_vinculo_id" UUID,
ADD COLUMN     "indicacao_referencia_id" UUID,
ADD COLUMN     "indicacao_texto" TEXT,
ADD COLUMN     "indicacao_tipo" "paciente_indicacao_tipo",
ADD COLUMN     "preferencia_comunicacao" "paciente_preferencia_comunicacao",
ADD COLUMN     "profissional_vinculo_id" UUID,
ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "paciente_consentimentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "tipo" "consentimento_tipo" NOT NULL,
    "aceito" BOOLEAN NOT NULL,
    "canal" "consentimento_canal" NOT NULL,
    "versao" TEXT NOT NULL,
    "observacao" TEXT,
    "registrado_por_id" TEXT,
    "registrado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paciente_consentimentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paciente_consentimentos_paciente_id_tipo_registrado_em_idx" ON "paciente_consentimentos"("paciente_id", "tipo", "registrado_em");

-- CreateIndex
CREATE INDEX "pacientes_canal_origem_idx" ON "pacientes"("canal_origem");

-- CreateIndex
CREATE INDEX "pacientes_created_at_idx" ON "pacientes"("created_at");

-- AddForeignKey
ALTER TABLE "paciente_consentimentos" ADD CONSTRAINT "paciente_consentimentos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Histórico inicial: quem já tinha recusado campanhas no cadastro ganha o registro de revogação.
-- Quem estava como "aceita" não ganha registro, pois nunca houve um aceite explícito (sem registro,
-- vale o comportamento anterior: pode receber).
INSERT INTO "paciente_consentimentos" ("paciente_id", "tipo", "aceito", "canal", "versao", "observacao", "registrado_em")
SELECT "id", 'CAMPANHAS', false, 'OUTRO', '1', 'Migrado do cadastro (opt-out anterior)', now()
FROM "pacientes"
WHERE "aceita_campanhas_whatsapp" = false;
