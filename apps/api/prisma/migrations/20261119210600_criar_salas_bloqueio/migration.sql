-- CreateEnum
CREATE TYPE "sala_bloqueio_tipo" AS ENUM ('BLOQUEIO', 'MANUTENCAO', 'RESERVA', 'CORTESIA', 'USO_AVULSO');

-- CreateTable
CREATE TABLE "salas_bloqueio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sala_id" UUID NOT NULL,
    "tipo" "sala_bloqueio_tipo" NOT NULL,
    "profissional_id" UUID,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "hora_inicio" TEXT,
    "hora_fim" TEXT,
    "motivo" TEXT,
    "criado_por_id" UUID,
    "cancelado_em" TIMESTAMPTZ(3),
    "cancelado_por_id" UUID,
    "motivo_cancelamento" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "salas_bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salas_bloqueio_dias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bloqueio_id" UUID NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,

    CONSTRAINT "salas_bloqueio_dias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salas_bloqueio_sala_id_data_inicio_data_fim_idx" ON "salas_bloqueio"("sala_id", "data_inicio", "data_fim");

-- CreateIndex
CREATE INDEX "salas_bloqueio_profissional_id_idx" ON "salas_bloqueio"("profissional_id");

-- CreateIndex
CREATE UNIQUE INDEX "salas_bloqueio_dias_bloqueio_id_dia_semana_key" ON "salas_bloqueio_dias"("bloqueio_id", "dia_semana");

-- AddForeignKey
ALTER TABLE "salas_bloqueio" ADD CONSTRAINT "salas_bloqueio_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salas_bloqueio" ADD CONSTRAINT "salas_bloqueio_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salas_bloqueio_dias" ADD CONSTRAINT "salas_bloqueio_dias_bloqueio_id_fkey" FOREIGN KEY ("bloqueio_id") REFERENCES "salas_bloqueio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
