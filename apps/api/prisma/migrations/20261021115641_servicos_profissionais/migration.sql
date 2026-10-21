-- CreateTable
CREATE TABLE "servicos_profissionais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profissional_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "duracao_minutos" INTEGER NOT NULL DEFAULT 30,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servicos_profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servicos_profissionais_profissional_id_idx" ON "servicos_profissionais"("profissional_id");

-- AddForeignKey
ALTER TABLE "servicos_profissionais" ADD CONSTRAINT "servicos_profissionais_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
