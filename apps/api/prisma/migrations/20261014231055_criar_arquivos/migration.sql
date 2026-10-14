-- CreateTable
CREATE TABLE "arquivos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "uso" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "criado_por" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arquivos_chave_key" ON "arquivos"("chave");

-- CreateIndex
CREATE INDEX "arquivos_uso_idx" ON "arquivos"("uso");
