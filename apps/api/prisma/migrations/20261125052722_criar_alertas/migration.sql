-- CreateTable
CREATE TABLE "alertas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alerta_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "lido_em" TIMESTAMPTZ(3),
    "resolvido_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alertas_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alertas_data_idx" ON "alertas"("data");

-- CreateIndex
CREATE UNIQUE INDEX "alertas_tipo_data_key" ON "alertas"("tipo", "data");

-- CreateIndex
CREATE INDEX "alertas_usuarios_usuario_id_idx" ON "alertas_usuarios"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "alertas_usuarios_alerta_id_usuario_id_key" ON "alertas_usuarios"("alerta_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "alertas_usuarios" ADD CONSTRAINT "alertas_usuarios_alerta_id_fkey" FOREIGN KEY ("alerta_id") REFERENCES "alertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
