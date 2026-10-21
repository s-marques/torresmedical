-- CreateEnum
CREATE TYPE "sala_tipo" AS ENUM ('CONSULTORIO', 'REUNIAO');

-- CreateTable
CREATE TABLE "salas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "numero" TEXT,
    "andar" TEXT,
    "tipo" "sala_tipo" NOT NULL DEFAULT 'CONSULTORIO',
    "capacidade" INTEGER NOT NULL DEFAULT 1,
    "metragem" DECIMAL(8,2),
    "valor_hora" DECIMAL(12,2),
    "valor_turno" DECIMAL(12,2),
    "valor_mensal" DECIMAL(12,2),
    "equipamentos" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "salas_pkey" PRIMARY KEY ("id")
);
