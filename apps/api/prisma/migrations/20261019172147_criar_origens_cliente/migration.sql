-- AlterTable
ALTER TABLE "pacientes" ADD COLUMN     "origem_cliente_id" UUID;

-- CreateTable
CREATE TABLE "origens_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "origens_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "origens_cliente_ordem_idx" ON "origens_cliente"("ordem");

-- CreateIndex
CREATE INDEX "pacientes_origem_cliente_id_idx" ON "pacientes"("origem_cliente_id");

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_origem_cliente_id_fkey" FOREIGN KEY ("origem_cliente_id") REFERENCES "origens_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
