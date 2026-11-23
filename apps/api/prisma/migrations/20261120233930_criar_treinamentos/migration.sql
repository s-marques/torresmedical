-- CreateTable
CREATE TABLE "tipos_treinamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tipos_treinamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treinamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "funcionario_id" UUID NOT NULL,
    "tipo_treinamento_id" UUID NOT NULL,
    "descricao" TEXT,
    "data_realizacao" DATE,
    "data_vencimento" DATE,
    "carga_horaria" INTEGER,
    "instituicao" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "treinamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treinamentos_funcionario_id_idx" ON "treinamentos"("funcionario_id");

-- CreateIndex
CREATE INDEX "treinamentos_tipo_treinamento_id_idx" ON "treinamentos"("tipo_treinamento_id");

-- CreateIndex
CREATE INDEX "treinamentos_data_vencimento_idx" ON "treinamentos"("data_vencimento");

-- AddForeignKey
ALTER TABLE "treinamentos" ADD CONSTRAINT "treinamentos_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamentos" ADD CONSTRAINT "treinamentos_tipo_treinamento_id_fkey" FOREIGN KEY ("tipo_treinamento_id") REFERENCES "tipos_treinamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
