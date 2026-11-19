-- CreateTable
CREATE TABLE "documentos_conhecimento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" TEXT NOT NULL,
    "profissional_id" UUID,
    "categoria" TEXT NOT NULL DEFAULT 'Geral',
    "conteudo" TEXT NOT NULL,
    "indexado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "documentos_conhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_conhecimento_profissional_id_idx" ON "documentos_conhecimento"("profissional_id");

-- AddForeignKey
ALTER TABLE "documentos_conhecimento" ADD CONSTRAINT "documentos_conhecimento_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
