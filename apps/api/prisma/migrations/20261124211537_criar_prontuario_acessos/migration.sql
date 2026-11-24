-- CreateTable
CREATE TABLE "prontuario_acessos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" TEXT NOT NULL,
    "paciente_id" UUID NOT NULL,
    "recurso" TEXT NOT NULL,
    "acessado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "ip" TEXT,

    CONSTRAINT "prontuario_acessos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prontuario_acessos_paciente_id_acessado_em_idx" ON "prontuario_acessos"("paciente_id", "acessado_em");

-- CreateIndex
CREATE INDEX "prontuario_acessos_usuario_id_acessado_em_idx" ON "prontuario_acessos"("usuario_id", "acessado_em");
