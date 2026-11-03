-- CreateEnum
CREATE TYPE "CaixaStatus" AS ENUM ('ABERTO', 'FECHADO');

-- CreateTable
CREATE TABLE "caixas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "operador_id" UUID NOT NULL,
    "data_abertura" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_fechamento" TIMESTAMPTZ(3),
    "valor_abertura" DECIMAL(12,2) NOT NULL,
    "valor_fechamento" DECIMAL(12,2),
    "quebra" DECIMAL(12,2),
    "status" "CaixaStatus" NOT NULL DEFAULT 'ABERTO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "caixas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caixas_numero_key" ON "caixas"("numero");

-- CreateIndex
CREATE INDEX "caixas_operador_id_status_idx" ON "caixas"("operador_id", "status");

-- CreateIndex
CREATE INDEX "caixas_data_abertura_idx" ON "caixas"("data_abertura");

-- AddForeignKey
ALTER TABLE "caixas" ADD CONSTRAINT "caixas_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
