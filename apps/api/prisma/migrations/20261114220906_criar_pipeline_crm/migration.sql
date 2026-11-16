-- CreateEnum
CREATE TYPE "marco_estagio" AS ENUM ('PRIMEIRO_CONTATO', 'VISITA', 'PROPOSTA', 'CONTRATO');

-- CreateEnum
CREATE TYPE "negocio_status" AS ENUM ('ABERTO', 'GANHO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "negocio_contato_tipo" AS ENUM ('PACIENTE', 'PROFISSIONAL');

-- CreateEnum
CREATE TYPE "atividade_negocio_tipo" AS ENUM ('FOLLOW_UP', 'TAREFA', 'VISITA', 'ENVIO_PROPOSTA');

-- CreateEnum
CREATE TYPE "atividade_negocio_status" AS ENUM ('PENDENTE', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estagios_pipeline" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "marco" "marco_estagio",
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "estagios_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivos_perda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "motivos_perda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negocios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "estagio_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "valor" DECIMAL(12,2),
    "contato_tipo" "negocio_contato_tipo",
    "contato_id" UUID,
    "responsavel_id" UUID,
    "previsao_fechamento" DATE,
    "origem_cliente_id" UUID,
    "status" "negocio_status" NOT NULL DEFAULT 'ABERTO',
    "motivo_perda_id" UUID,
    "fechado_em" TIMESTAMPTZ(3),
    "marco_primeiro_contato_em" TIMESTAMPTZ(3),
    "marco_visita_em" TIMESTAMPTZ(3),
    "marco_proposta_em" TIMESTAMPTZ(3),
    "marco_contrato_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividades_negocio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "tipo" "atividade_negocio_tipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "data_hora" TIMESTAMPTZ(3) NOT NULL,
    "responsavel_id" UUID,
    "status" "atividade_negocio_status" NOT NULL DEFAULT 'PENDENTE',
    "concluida_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "atividades_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_ordem_idx" ON "pipelines"("ordem");

-- CreateIndex
CREATE INDEX "estagios_pipeline_pipeline_id_ordem_idx" ON "estagios_pipeline"("pipeline_id", "ordem");

-- CreateIndex
CREATE INDEX "motivos_perda_ordem_idx" ON "motivos_perda"("ordem");

-- CreateIndex
CREATE INDEX "negocios_pipeline_id_status_idx" ON "negocios"("pipeline_id", "status");

-- CreateIndex
CREATE INDEX "negocios_estagio_id_idx" ON "negocios"("estagio_id");

-- CreateIndex
CREATE INDEX "negocios_contato_id_idx" ON "negocios"("contato_id");

-- CreateIndex
CREATE INDEX "negocios_origem_cliente_id_idx" ON "negocios"("origem_cliente_id");

-- CreateIndex
CREATE INDEX "atividades_negocio_negocio_id_status_data_hora_idx" ON "atividades_negocio"("negocio_id", "status", "data_hora");

-- CreateIndex
CREATE INDEX "atividades_negocio_responsavel_id_idx" ON "atividades_negocio"("responsavel_id");

-- AddForeignKey
ALTER TABLE "estagios_pipeline" ADD CONSTRAINT "estagios_pipeline_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_estagio_id_fkey" FOREIGN KEY ("estagio_id") REFERENCES "estagios_pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_origem_cliente_id_fkey" FOREIGN KEY ("origem_cliente_id") REFERENCES "origens_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_motivo_perda_id_fkey" FOREIGN KEY ("motivo_perda_id") REFERENCES "motivos_perda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades_negocio" ADD CONSTRAINT "atividades_negocio_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
