-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "bloqueado_ate" TIMESTAMPTZ(3),
ADD COLUMN     "senha_alterada_em" TIMESTAMPTZ(3),
ADD COLUMN     "tentativas_falhas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trocar_senha_no_acesso" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "politica_seguranca" (
    "empresa_id" UUID NOT NULL,
    "tamanho_minimo" INTEGER NOT NULL DEFAULT 8,
    "exigir_maiuscula" BOOLEAN NOT NULL DEFAULT false,
    "exigir_simbolo" BOOLEAN NOT NULL DEFAULT false,
    "tentativas_bloqueio" INTEGER NOT NULL DEFAULT 5,
    "minutos_bloqueio" INTEGER NOT NULL DEFAULT 15,
    "troca_primeiro_acesso" BOOLEAN NOT NULL DEFAULT true,
    "expiracao_dias" INTEGER,
    "carencia_profissional_dias" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "politica_seguranca_pkey" PRIMARY KEY ("empresa_id")
);

-- AddForeignKey
ALTER TABLE "politica_seguranca" ADD CONSTRAINT "politica_seguranca_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
