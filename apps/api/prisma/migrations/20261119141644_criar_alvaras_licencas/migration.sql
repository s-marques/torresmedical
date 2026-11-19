-- CreateTable
CREATE TABLE "tipos_licenca" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tipos_licenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licencas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unidade_id" UUID NOT NULL,
    "tipo_licenca_id" UUID NOT NULL,
    "nao_se_aplica" BOOLEAN NOT NULL DEFAULT false,
    "numero_documento" TEXT,
    "orgao_emissor" TEXT,
    "titular" TEXT,
    "data_emissao" DATE,
    "data_vencimento" DATE,
    "telefone" TEXT,
    "email" TEXT,
    "departamento" TEXT,
    "plataforma_online" BOOLEAN NOT NULL DEFAULT false,
    "como_renovar" TEXT,
    "documentos_obrigatorios" TEXT,
    "endereco_presencial" TEXT,
    "horario_atendimento" TEXT,
    "prazo_analise" TEXT,
    "responsavel" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "licencas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "licencas_unidade_id_idx" ON "licencas"("unidade_id");

-- CreateIndex
CREATE INDEX "licencas_tipo_licenca_id_idx" ON "licencas"("tipo_licenca_id");

-- CreateIndex
CREATE INDEX "licencas_data_vencimento_idx" ON "licencas"("data_vencimento");

-- AddForeignKey
ALTER TABLE "licencas" ADD CONSTRAINT "licencas_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licencas" ADD CONSTRAINT "licencas_tipo_licenca_id_fkey" FOREIGN KEY ("tipo_licenca_id") REFERENCES "tipos_licenca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
