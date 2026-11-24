-- CreateEnum
CREATE TYPE "profissional_documento_tipo" AS ENUM ('CONTRATO', 'DOCUMENTO_PESSOAL', 'REGISTRO_CONSELHO', 'RQE', 'LICENCA', 'CERTIFICADO', 'DOCUMENTO_SANITARIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "profissional_documento_situacao" AS ENUM ('ENVIADO', 'VALIDADO', 'RECUSADO');

-- CreateTable
CREATE TABLE "profissionais_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "tipo" "profissional_documento_tipo" NOT NULL,
    "arquivo_id" UUID NOT NULL,
    "numero" TEXT,
    "emissao" DATE,
    "validade" DATE,
    "observacao" TEXT,
    "situacao" "profissional_documento_situacao" NOT NULL DEFAULT 'ENVIADO',
    "motivo_recusa" TEXT,
    "validado_por_id" TEXT,
    "validado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "profissionais_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profissionais_documentos_profissional_id_deleted_at_idx" ON "profissionais_documentos"("profissional_id", "deleted_at");

-- CreateIndex
CREATE INDEX "profissionais_documentos_validade_idx" ON "profissionais_documentos"("validade");

-- AddForeignKey
ALTER TABLE "profissionais_documentos" ADD CONSTRAINT "profissionais_documentos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
