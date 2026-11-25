-- CreateTable
CREATE TABLE "backup_execucoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "usuario_id" UUID,
    "iniciado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMPTZ(3),
    "tamanho_bytes" BIGINT,
    "arquivos_copiados" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "destino_chave" TEXT,
    "erro_codigo" TEXT,
    "detalhes" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "backup_execucoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_execucoes_iniciado_em_idx" ON "backup_execucoes"("iniciado_em");

-- CreateIndex
CREATE INDEX "backup_execucoes_tipo_status_iniciado_em_idx" ON "backup_execucoes"("tipo", "status", "iniciado_em");
