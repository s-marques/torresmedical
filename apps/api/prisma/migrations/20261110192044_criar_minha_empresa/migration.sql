-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "logo_arquivo_id" UUID;

-- AlterTable
ALTER TABLE "unidades" ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "cnes" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "uf" VARCHAR(2);

-- CreateTable
CREATE TABLE "horarios_funcionamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "fechado" BOOLEAN NOT NULL DEFAULT false,
    "abre" VARCHAR(5),
    "fecha" VARCHAR(5),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "horarios_funcionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios_intervalos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "horario_id" UUID NOT NULL,
    "inicio" VARCHAR(5) NOT NULL,
    "fim" VARCHAR(5) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "horarios_intervalos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horarios_funcionamento_empresa_id_dia_semana_key" ON "horarios_funcionamento"("empresa_id", "dia_semana");

-- CreateIndex
CREATE INDEX "horarios_intervalos_horario_id_idx" ON "horarios_intervalos"("horario_id");

-- AddForeignKey
ALTER TABLE "horarios_funcionamento" ADD CONSTRAINT "horarios_funcionamento_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_intervalos" ADD CONSTRAINT "horarios_intervalos_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horarios_funcionamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
