-- CreateTable
CREATE TABLE "baixas_insumos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID,
    "profissional_id" UUID,
    "unidade_id" UUID,
    "pressao_arterial" TEXT,
    "dextro" TEXT,
    "observacao" TEXT,
    "usuario_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baixas_insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baixas_insumos_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "baixa_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "baixas_insumos_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "baixas_insumos_created_at_idx" ON "baixas_insumos"("created_at");

-- CreateIndex
CREATE INDEX "baixas_insumos_paciente_id_idx" ON "baixas_insumos"("paciente_id");

-- CreateIndex
CREATE INDEX "baixas_insumos_itens_baixa_id_idx" ON "baixas_insumos_itens"("baixa_id");

-- CreateIndex
CREATE INDEX "baixas_insumos_itens_produto_id_idx" ON "baixas_insumos_itens"("produto_id");

-- AddForeignKey
ALTER TABLE "baixas_insumos" ADD CONSTRAINT "baixas_insumos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas_insumos" ADD CONSTRAINT "baixas_insumos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas_insumos" ADD CONSTRAINT "baixas_insumos_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas_insumos_itens" ADD CONSTRAINT "baixas_insumos_itens_baixa_id_fkey" FOREIGN KEY ("baixa_id") REFERENCES "baixas_insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas_insumos_itens" ADD CONSTRAINT "baixas_insumos_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
