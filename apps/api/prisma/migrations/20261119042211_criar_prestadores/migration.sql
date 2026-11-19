-- CreateEnum
CREATE TYPE "prestador_categoria" AS ENUM ('ELETRICA', 'HIDRAULICA', 'PINTURA', 'AR_CONDICIONADO', 'JARDINAGEM', 'SERRALHERIA', 'MARCENARIA', 'GESSO', 'DEDETIZACAO', 'LIMPEZA_CAIXA', 'TI', 'REFRIGERACAO', 'OUTROS');

-- CreateEnum
CREATE TYPE "prestador_status" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "prestador_tipo_pessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "prestador_forma_pagamento" AS ENUM ('PIX', 'TRANSFERENCIA', 'BOLETO', 'DINHEIRO', 'CARTAO');

-- CreateEnum
CREATE TYPE "prestador_avaliacao_preco" AS ENUM ('BARATO', 'JUSTO', 'CARO');

-- CreateTable
CREATE TABLE "prestadores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "tipo_pessoa" "prestador_tipo_pessoa" NOT NULL DEFAULT 'FISICA',
    "documento" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "status" "prestador_status" NOT NULL DEFAULT 'ATIVO',
    "endereco" TEXT,
    "categoria" "prestador_categoria" NOT NULL DEFAULT 'ELETRICA',
    "descricao_servico" TEXT,
    "atende_urgencia" BOOLEAN NOT NULL DEFAULT false,
    "atende_fim_semana" BOOLEAN NOT NULL DEFAULT false,
    "forma_pagamento" "prestador_forma_pagamento" NOT NULL DEFAULT 'PIX',
    "chave_pix" TEXT,
    "valor_hora" DECIMAL(12,2),
    "valor_diaria" DECIMAL(12,2),
    "emite_nota_fiscal" BOOLEAN NOT NULL DEFAULT false,
    "nota_qualidade" SMALLINT NOT NULL DEFAULT 3,
    "nota_pontualidade" SMALLINT NOT NULL DEFAULT 3,
    "avaliacao_preco" "prestador_avaliacao_preco" NOT NULL DEFAULT 'JUSTO',
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "prestadores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prestadores_categoria_idx" ON "prestadores"("categoria");

-- CreateIndex
CREATE INDEX "prestadores_documento_idx" ON "prestadores"("documento");
