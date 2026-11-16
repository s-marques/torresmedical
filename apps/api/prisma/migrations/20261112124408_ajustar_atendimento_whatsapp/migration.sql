-- CreateEnum
CREATE TYPE "mensagem_whatsapp_autor" AS ENUM ('CLIENTE', 'ATENDENTE', 'ASSISTENTE_VIRTUAL', 'CELULAR');

-- CreateEnum
CREATE TYPE "mensagem_whatsapp_status" AS ENUM ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA');

-- CreateEnum
CREATE TYPE "mensagem_whatsapp_tipo" AS ENUM ('TEXTO', 'AUDIO', 'IMAGEM', 'DOCUMENTO', 'VIDEO');

-- AlterTable
ALTER TABLE "conversas_whatsapp" ADD COLUMN     "anuncio_origem" TEXT,
ADD COLUMN     "anuncio_titulo" TEXT,
ADD COLUMN     "anuncio_url" TEXT,
ADD COLUMN     "atendente_id" UUID;

-- AlterTable
ALTER TABLE "mensagens_whatsapp" ADD COLUMN     "autor" "mensagem_whatsapp_autor" NOT NULL DEFAULT 'CLIENTE',
ADD COLUMN     "autor_usuario_id" UUID,
ADD COLUMN     "duracao_segundos" INTEGER,
ADD COLUMN     "responde_a_id" UUID,
ADD COLUMN     "status" "mensagem_whatsapp_status" NOT NULL DEFAULT 'ENVIADA',
ADD COLUMN     "tipo" "mensagem_whatsapp_tipo" NOT NULL DEFAULT 'TEXTO';

-- CreateIndex
CREATE INDEX "conversas_whatsapp_atendente_id_idx" ON "conversas_whatsapp"("atendente_id");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_autor_usuario_id_idx" ON "mensagens_whatsapp"("autor_usuario_id");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_responde_a_id_idx" ON "mensagens_whatsapp"("responde_a_id");

-- AddForeignKey
ALTER TABLE "conversas_whatsapp" ADD CONSTRAINT "conversas_whatsapp_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_autor_usuario_id_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_responde_a_id_fkey" FOREIGN KEY ("responde_a_id") REFERENCES "mensagens_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
