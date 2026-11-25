-- CreateTable
CREATE TABLE "exportacoes_lote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entidade" TEXT NOT NULL,
    "incluir_arquivos" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "solicitado_por_id" TEXT,
    "solicitada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMPTZ(3),
    "concluida_em" TIMESTAMPTZ(3),
    "expira_em" TIMESTAMPTZ(3),
    "arquivo_id" UUID,
    "tamanho_bytes" INTEGER,
    "erro_codigo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exportacoes_lote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exportacoes_lote_solicitada_em_idx" ON "exportacoes_lote"("solicitada_em");

-- CreateIndex
CREATE INDEX "exportacoes_lote_entidade_status_idx" ON "exportacoes_lote"("entidade", "status");

-- Exportação em lote (issue #158): o perfil Administrador dos ambientes que já existem recebe as
-- permissões novas (como na migration do controle de exportação, #156). Idempotente; só acrescenta.
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao")
SELECT p."id", v."permissao"
FROM "perfis" p
JOIN (VALUES
  ('Administrador', 'configuracoes-gestao.exportacao-lote.ver'),
  ('Administrador', 'configuracoes-gestao.exportacao-lote.executar')
) AS v("nome", "permissao") ON v."nome" = p."nome"
WHERE p."padrao" = true
ON CONFLICT DO NOTHING;
