-- CreateEnum
CREATE TYPE "atendimento_anexo_tipo" AS ENUM ('EXAME', 'ANEXO');

-- CreateEnum
CREATE TYPE "atendimento_documento_tipo" AS ENUM ('ATESTADO', 'DECLARACAO', 'SOLICITACAO_EXAME');

-- CreateEnum
CREATE TYPE "atendimento_versao_tipo" AS ENUM ('ASSINATURA', 'ADENDO');

-- AlterTable
ALTER TABLE "atendimentos" ADD COLUMN     "assinado_em" TIMESTAMPTZ(3),
ADD COLUMN     "assinado_por_id" UUID,
ADD COLUMN     "assinatura_hash" TEXT;

-- CreateTable
CREATE TABLE "atendimento_anexos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "atendimento_id" UUID NOT NULL,
    "tipo" "atendimento_anexo_tipo" NOT NULL,
    "arquivo_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "descricao" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "atendimento_anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atendimento_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "atendimento_id" UUID NOT NULL,
    "tipo" "atendimento_documento_tipo" NOT NULL,
    "texto" TEXT NOT NULL,
    "data_emissao" DATE NOT NULL,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "atendimento_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atendimento_versoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "atendimento_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "atendimento_versao_tipo" NOT NULL,
    "usuario_id" UUID NOT NULL,
    "texto" TEXT,
    "antes" JSONB,
    "depois" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atendimento_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atendimento_anexos_atendimento_id_idx" ON "atendimento_anexos"("atendimento_id");

-- CreateIndex
CREATE INDEX "atendimento_documentos_atendimento_id_idx" ON "atendimento_documentos"("atendimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "atendimento_versoes_atendimento_id_numero_key" ON "atendimento_versoes"("atendimento_id", "numero");

-- AddForeignKey
ALTER TABLE "atendimento_anexos" ADD CONSTRAINT "atendimento_anexos_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento_documentos" ADD CONSTRAINT "atendimento_documentos_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimento_versoes" ADD CONSTRAINT "atendimento_versoes_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
