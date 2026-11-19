-- CreateEnum
CREATE TYPE "receituario_tipo" AS ENUM ('AMARELA', 'AZUL', 'BRANCA');

-- CreateEnum
CREATE TYPE "receituario_bloco_status" AS ENUM ('ATIVO', 'FINALIZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "receituario_blocos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "receituario_tipo" NOT NULL,
    "numero_inicio" INTEGER NOT NULL,
    "numero_fim" INTEGER NOT NULL,
    "localizacao" TEXT,
    "profissional_id" UUID,
    "data_recebimento" DATE,
    "usados" INTEGER NOT NULL DEFAULT 0,
    "status" "receituario_bloco_status" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "receituario_blocos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescricoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bloco_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "atendimento_id" UUID,
    "medicacao" TEXT NOT NULL,
    "posologia" TEXT,
    "data_prescricao" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "prescricoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receituario_blocos_tipo_numero_inicio_idx" ON "receituario_blocos"("tipo", "numero_inicio");

-- CreateIndex
CREATE INDEX "receituario_blocos_profissional_id_idx" ON "receituario_blocos"("profissional_id");

-- CreateIndex
CREATE INDEX "prescricoes_paciente_id_idx" ON "prescricoes"("paciente_id");

-- CreateIndex
CREATE INDEX "prescricoes_profissional_id_idx" ON "prescricoes"("profissional_id");

-- CreateIndex
CREATE INDEX "prescricoes_data_prescricao_idx" ON "prescricoes"("data_prescricao");

-- CreateIndex
CREATE UNIQUE INDEX "prescricoes_bloco_id_numero_key" ON "prescricoes"("bloco_id", "numero");

-- AddForeignKey
ALTER TABLE "prescricoes" ADD CONSTRAINT "prescricoes_bloco_id_fkey" FOREIGN KEY ("bloco_id") REFERENCES "receituario_blocos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescricoes" ADD CONSTRAINT "prescricoes_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
