-- CreateEnum
CREATE TYPE "tipo_item" AS ENUM ('PRODUTO', 'SERVICO');

-- CreateEnum
CREATE TYPE "finalidade_pagamento" AS ENUM ('RECEBER', 'PAGAR');

-- CreateEnum
CREATE TYPE "tipo_forma_pagamento" AS ENUM ('DINHEIRO', 'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CONVENIO', 'CORTESIA', 'PERMUTA', 'PAGAMENTO');

-- CreateTable
CREATE TABLE "pacientes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "especialidades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "especialidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissionais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "registro" TEXT,
    "especialidade_id" UUID,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" "tipo_item" NOT NULL,
    "cor" TEXT,
    "descricao" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_medida" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "tipo" "tipo_item" NOT NULL,
    "codigo" TEXT,
    "categoria_id" UUID,
    "unidade_medida_id" UUID,
    "preco_venda" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funcionarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "cargo_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formas_pagamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "finalidade" "finalidade_pagamento" NOT NULL,
    "tipo" "tipo_forma_pagamento" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "formas_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_agendamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "duracao_minutos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tipos_agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pacientes_documento_idx" ON "pacientes"("documento");

-- CreateIndex
CREATE INDEX "profissionais_especialidade_id_idx" ON "profissionais"("especialidade_id");

-- CreateIndex
CREATE INDEX "fornecedores_documento_idx" ON "fornecedores"("documento");

-- CreateIndex
CREATE INDEX "produtos_categoria_id_idx" ON "produtos"("categoria_id");

-- CreateIndex
CREATE INDEX "produtos_unidade_medida_id_idx" ON "produtos"("unidade_medida_id");

-- CreateIndex
CREATE INDEX "produtos_codigo_idx" ON "produtos"("codigo");

-- CreateIndex
CREATE INDEX "funcionarios_cargo_id_idx" ON "funcionarios"("cargo_id");

-- AddForeignKey
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_especialidade_id_fkey" FOREIGN KEY ("especialidade_id") REFERENCES "especialidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_unidade_medida_id_fkey" FOREIGN KEY ("unidade_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
