-- CreateTable
CREATE TABLE "respostas_rapidas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'Geral',
    "atalho" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "respostas_rapidas_pkey" PRIMARY KEY ("id")
);
