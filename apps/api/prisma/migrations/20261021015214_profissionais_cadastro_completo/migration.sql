-- CreateEnum
CREATE TYPE "estado_civil" AS ENUM ('SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL');

-- CreateEnum
CREATE TYPE "layout_receita" AS ENUM ('PADRAO', 'COMPACTO', 'TIMBRADO', 'PERSONALIZADO');

-- CreateEnum
CREATE TYPE "horario_tipo" AS ENUM ('SEMANAL', 'POR_DATA');

-- CreateEnum
CREATE TYPE "bloqueio_tipo" AS ENUM ('DIA_INTEIRO', 'HORARIO');

-- CreateEnum
CREATE TYPE "bloqueio_motivo" AS ENUM ('FERIAS', 'FOLGA', 'CONGRESSO_CURSO', 'ATESTADO_MEDICO', 'FERIADO', 'REUNIAO', 'OUTRO');

-- AlterTable
ALTER TABLE "profissionais" ADD COLUMN     "cnes" TEXT,
ADD COLUMN     "comissao" DECIMAL(5,2),
ADD COLUMN     "cor_calendario" TEXT NOT NULL DEFAULT 'azul',
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "data_nascimento" DATE,
ADD COLUMN     "duracao_padrao" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "endereco_consultorio" TEXT,
ADD COLUMN     "estado_civil" "estado_civil",
ADD COLUMN     "foto_arquivo_id" UUID,
ADD COLUMN     "layout_receita" "layout_receita" NOT NULL DEFAULT 'PADRAO',
ADD COLUMN     "logo_receita_arquivo_id" UUID,
ADD COLUMN     "memed_api_token" TEXT,
ADD COLUMN     "memed_secret_key" TEXT,
ADD COLUMN     "naturalidade" TEXT,
ADD COLUMN     "outras_especialidades" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "rodape_receita" TEXT,
ADD COLUMN     "telefone_receita" TEXT,
ADD COLUMN     "valor_consulta" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "horarios_atendimento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "tipo" "horario_tipo" NOT NULL,
    "dia_semana" INTEGER,
    "data" DATE,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,
    "almoco_inicio" TEXT,
    "almoco_fim" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "horarios_atendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueios_agenda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "tipo" "bloqueio_tipo" NOT NULL,
    "hora_inicio" TEXT,
    "hora_fim" TEXT,
    "motivo" "bloqueio_motivo" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "bloqueios_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "horarios_atendimento_profissional_id_idx" ON "horarios_atendimento"("profissional_id");

-- CreateIndex
CREATE INDEX "bloqueios_agenda_profissional_id_data_fim_idx" ON "bloqueios_agenda"("profissional_id", "data_fim");

-- AddForeignKey
ALTER TABLE "horarios_atendimento" ADD CONSTRAINT "horarios_atendimento_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios_agenda" ADD CONSTRAINT "bloqueios_agenda_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
