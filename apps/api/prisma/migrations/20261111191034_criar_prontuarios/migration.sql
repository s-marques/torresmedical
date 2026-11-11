-- CreateEnum
CREATE TYPE "atendimento_tipo" AS ENUM ('CONSULTA', 'RETORNO', 'PROCEDIMENTO', 'EXAME');

-- CreateEnum
CREATE TYPE "atendimento_status" AS ENUM ('EM_ANDAMENTO', 'FINALIZADO');

-- CreateTable
CREATE TABLE "prontuarios" (
    "paciente_id" UUID NOT NULL,
    "alergias" TEXT,
    "medicamentos_em_uso" TEXT,
    "doencas_cronicas" TEXT,
    "cirurgias_anteriores" TEXT,
    "historico_familiar" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prontuarios_pkey" PRIMARY KEY ("paciente_id")
);

-- CreateTable
CREATE TABLE "atendimentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "tipo" "atendimento_tipo",
    "queixa" TEXT,
    "evolucao" TEXT,
    "diagnostico" TEXT,
    "conduta" TEXT,
    "observacoes" TEXT,
    "status" "atendimento_status" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "horario" TIMESTAMPTZ(3),
    "procedimento_id" UUID,
    "pagamento_status" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "atendimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anamneses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "profissional_id" UUID,
    "queixa_principal" TEXT,
    "historia_doenca_atual" TEXT,
    "exame_fisico" TEXT,
    "hipotese_diagnostica" TEXT,
    "conduta" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "anamneses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atendimentos_paciente_id_idx" ON "atendimentos"("paciente_id");

-- CreateIndex
CREATE INDEX "atendimentos_profissional_id_idx" ON "atendimentos"("profissional_id");

-- CreateIndex
CREATE INDEX "anamneses_paciente_id_idx" ON "anamneses"("paciente_id");
