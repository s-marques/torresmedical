-- AlterTable
ALTER TABLE "contas_pagar" ADD COLUMN     "centro_custo_id" UUID,
ADD COLUMN     "competencia" VARCHAR(7),
ADD COLUMN     "documento_arquivo_id" UUID;

-- AlterTable
ALTER TABLE "contas_pagar_baixas" ADD COLUMN     "divergencia" DECIMAL(12,2),
ADD COLUMN     "justificativa_divergencia" TEXT;

-- CreateTable
CREATE TABLE "centros_custo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "centros_custo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contas_pagar_centro_custo_id_idx" ON "contas_pagar"("centro_custo_id");

-- CreateIndex
CREATE INDEX "contas_pagar_baixas_divergencia_idx" ON "contas_pagar_baixas"("divergencia");

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_centro_custo_id_fkey" FOREIGN KEY ("centro_custo_id") REFERENCES "centros_custo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
