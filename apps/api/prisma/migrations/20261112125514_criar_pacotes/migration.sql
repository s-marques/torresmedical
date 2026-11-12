-- CreateEnum
CREATE TYPE "pacote_status" AS ENUM ('ATIVO', 'CANCELADO');

-- CreateTable
CREATE TABLE "pacotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paciente_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "valor_total" DECIMAL(12,2) NOT NULL,
    "data_inicio" DATE,
    "data_vencimento" DATE,
    "profissional_id" UUID,
    "observacoes" TEXT,
    "sessoes_total" INTEGER NOT NULL,
    "sessoes_usadas" INTEGER NOT NULL DEFAULT 0,
    "status" "pacote_status" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pacotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacote_itens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pacote_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "posicao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pacote_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacote_usos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pacote_id" UUID NOT NULL,
    "profissional_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "observacoes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pacote_usos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pacotes_paciente_id_idx" ON "pacotes"("paciente_id");

-- CreateIndex
CREATE INDEX "pacotes_status_idx" ON "pacotes"("status");

-- CreateIndex
CREATE INDEX "pacotes_data_vencimento_idx" ON "pacotes"("data_vencimento");

-- CreateIndex
CREATE INDEX "pacotes_created_at_idx" ON "pacotes"("created_at");

-- CreateIndex
CREATE INDEX "pacote_itens_pacote_id_idx" ON "pacote_itens"("pacote_id");

-- CreateIndex
CREATE INDEX "pacote_usos_pacote_id_idx" ON "pacote_usos"("pacote_id");

-- CreateIndex
CREATE INDEX "pacote_usos_profissional_id_idx" ON "pacote_usos"("profissional_id");

-- AddForeignKey
ALTER TABLE "pacotes" ADD CONSTRAINT "pacotes_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacotes" ADD CONSTRAINT "pacotes_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacote_itens" ADD CONSTRAINT "pacote_itens_pacote_id_fkey" FOREIGN KEY ("pacote_id") REFERENCES "pacotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacote_usos" ADD CONSTRAINT "pacote_usos_pacote_id_fkey" FOREIGN KEY ("pacote_id") REFERENCES "pacotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacote_usos" ADD CONSTRAINT "pacote_usos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
