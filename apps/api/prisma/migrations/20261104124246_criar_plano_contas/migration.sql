-- CreateEnum
CREATE TYPE "PlanoContaTipo" AS ENUM ('RECEITA', 'DESPESA', 'ATIVO', 'PASSIVO');

-- CreateTable
CREATE TABLE "planos_contas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "PlanoContaTipo" NOT NULL,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "conta_pai_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "planos_contas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planos_contas_codigo_key" ON "planos_contas"("codigo");

-- CreateIndex
CREATE INDEX "planos_contas_conta_pai_id_idx" ON "planos_contas"("conta_pai_id");

-- AddForeignKey
ALTER TABLE "planos_contas" ADD CONSTRAINT "planos_contas_conta_pai_id_fkey" FOREIGN KEY ("conta_pai_id") REFERENCES "planos_contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
