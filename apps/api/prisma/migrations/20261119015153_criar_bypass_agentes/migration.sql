-- CreateTable
CREATE TABLE "bypass_agentes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "cargo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "bypass_agentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bypass_agentes_telefone_idx" ON "bypass_agentes"("telefone");
