-- CreateTable
CREATE TABLE "lotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "produto_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "data_vencimento" DATE NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_produto_id_idx" ON "lotes"("produto_id");

-- CreateIndex
CREATE INDEX "lotes_data_vencimento_idx" ON "lotes"("data_vencimento");

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

