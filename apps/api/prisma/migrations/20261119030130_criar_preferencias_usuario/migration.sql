-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "avatar_arquivo_id" UUID;

-- CreateTable
CREATE TABLE "preferencias_usuario" (
    "usuario_id" UUID NOT NULL,
    "notificacoes_agenda" BOOLEAN NOT NULL DEFAULT true,
    "novidades_sistema" BOOLEAN NOT NULL DEFAULT false,
    "alertas_seguranca" BOOLEAN NOT NULL DEFAULT true,
    "notificacoes_push" BOOLEAN NOT NULL DEFAULT true,
    "resumo_semanal" BOOLEAN NOT NULL DEFAULT false,
    "tema" TEXT NOT NULL DEFAULT 'sistema',
    "esquema_cor" TEXT NOT NULL DEFAULT 'esmeralda',
    "densidade" TEXT NOT NULL DEFAULT 'confortavel',
    "idioma" TEXT NOT NULL DEFAULT 'pt-BR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "preferencias_usuario_pkey" PRIMARY KEY ("usuario_id")
);

-- AddForeignKey
ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
