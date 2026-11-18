-- AlterEnum
ALTER TYPE "canal_whatsapp_status" ADD VALUE 'AGUARDANDO_QR';

-- AlterTable
ALTER TABLE "canais_whatsapp" ADD COLUMN     "profissional_id" UUID;

-- CreateTable
CREATE TABLE "canais_whatsapp_usuarios" (
    "canal_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,

    CONSTRAINT "canais_whatsapp_usuarios_pkey" PRIMARY KEY ("canal_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "canais_whatsapp_usuarios_usuario_id_idx" ON "canais_whatsapp_usuarios"("usuario_id");

-- CreateIndex
CREATE INDEX "canais_whatsapp_profissional_id_idx" ON "canais_whatsapp"("profissional_id");

-- AddForeignKey
ALTER TABLE "canais_whatsapp" ADD CONSTRAINT "canais_whatsapp_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canais_whatsapp_usuarios" ADD CONSTRAINT "canais_whatsapp_usuarios_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canais_whatsapp_usuarios" ADD CONSTRAINT "canais_whatsapp_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
