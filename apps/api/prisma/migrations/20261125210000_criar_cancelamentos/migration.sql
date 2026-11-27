-- CreateEnum
CREATE TYPE "tipo_cancelamento" AS ENUM ('CONSULTA', 'CONTRATO', 'COBRANCA', 'PERIODO', 'PROPOSTA');

-- CreateTable
CREATE TABLE "motivos_cancelamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "tipo_cancelamento" NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "exige_texto" BOOLEAN NOT NULL DEFAULT false,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "motivos_cancelamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancelamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "tipo_cancelamento" NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" UUID NOT NULL,
    "motivo_id" UUID,
    "motivo_nome" TEXT NOT NULL,
    "observacao" TEXT,
    "cancelado_por_id" UUID,
    "cancelado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profissional_id" UUID,
    "reagendou_para_id" UUID,

    CONSTRAINT "cancelamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motivos_cancelamento_tipo_ordem_idx" ON "motivos_cancelamento"("tipo", "ordem");

-- CreateIndex
CREATE INDEX "cancelamentos_tipo_cancelado_em_idx" ON "cancelamentos"("tipo", "cancelado_em");

-- CreateIndex
CREATE INDEX "cancelamentos_profissional_id_cancelado_em_idx" ON "cancelamentos"("profissional_id", "cancelado_em");

-- CreateIndex
CREATE INDEX "cancelamentos_entidade_entidade_id_idx" ON "cancelamentos"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "cancelamentos_motivo_id_idx" ON "cancelamentos"("motivo_id");

-- CreateIndex
CREATE INDEX "cancelamentos_cancelado_em_idx" ON "cancelamentos"("cancelado_em");

-- AddForeignKey
ALTER TABLE "cancelamentos" ADD CONSTRAINT "cancelamentos_motivo_id_fkey" FOREIGN KEY ("motivo_id") REFERENCES "motivos_cancelamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Motivos iniciais por tipo (issue #162). Só o contrato usa a lista do documento do cliente
-- (R §35); as demais são sugestões, editáveis pelo cadastro. "Outro" e "Contrato cancelado" são
-- motivos de sistema: o código os usa e eles não saem da lista.
INSERT INTO "motivos_cancelamento" ("tipo", "nome", "codigo", "exige_texto", "sistema", "ordem", "updated_at")
SELECT v."tipo"::"tipo_cancelamento", v."nome", v."codigo", v."exige_texto", v."sistema", v."ordem", CURRENT_TIMESTAMP
FROM (VALUES
  ('CONSULTA', 'Paciente desistiu', 'paciente_desistiu', false, false, 1),
  ('CONSULTA', 'Paciente sem condições de comparecer', 'paciente_sem_condicoes_de_comparecer', false, false, 2),
  ('CONSULTA', 'Profissional indisponível', 'profissional_indisponivel', false, false, 3),
  ('CONSULTA', 'Erro de agendamento', 'erro_de_agendamento', false, false, 4),
  ('CONSULTA', 'Outro', 'outro', true, true, 99),
  ('CONTRATO', 'Valor', 'valor', false, false, 1),
  ('CONTRATO', 'Mudança de cidade', 'mudanca_de_cidade', false, false, 2),
  ('CONTRATO', 'Baixa demanda', 'baixa_demanda', false, false, 3),
  ('CONTRATO', 'Estrutura própria', 'estrutura_propria', false, false, 4),
  ('CONTRATO', 'Horários', 'horarios', false, false, 5),
  ('CONTRATO', 'Experiência', 'experiencia', false, false, 6),
  ('CONTRATO', 'Outro', 'outro', true, true, 99),
  ('COBRANCA', 'Lançamento duplicado', 'lancamento_duplicado', false, false, 1),
  ('COBRANCA', 'Lançamento incorreto', 'lancamento_incorreto', false, false, 2),
  ('COBRANCA', 'Serviço não realizado', 'servico_nao_realizado', false, false, 3),
  ('COBRANCA', 'Negociação com o cliente', 'negociacao_com_o_cliente', false, false, 4),
  ('COBRANCA', 'Contrato encerrado ou cancelado', 'contrato_cancelado', false, true, 5),
  ('COBRANCA', 'Outro', 'outro', true, true, 99),
  ('PERIODO', 'Mudança de planos do profissional', 'mudanca_de_planos_do_profissional', false, false, 1),
  ('PERIODO', 'Manutenção da sala', 'manutencao_da_sala', false, false, 2),
  ('PERIODO', 'Reserva não utilizada', 'reserva_nao_utilizada', false, false, 3),
  ('PERIODO', 'Lançamento incorreto', 'lancamento_incorreto', false, false, 4),
  ('PERIODO', 'Outro', 'outro', true, true, 99),
  ('PROPOSTA', 'Valor', 'valor', false, false, 1),
  ('PROPOSTA', 'Optou por outro serviço ou clínica', 'optou_por_outro_servico_ou_clinica', false, false, 2),
  ('PROPOSTA', 'Sem retorno do cliente', 'sem_retorno_do_cliente', false, false, 3),
  ('PROPOSTA', 'Desistiu do tratamento', 'desistiu_do_tratamento', false, false, 4),
  ('PROPOSTA', 'Lançamento incorreto', 'lancamento_incorreto', false, false, 5),
  ('PROPOSTA', 'Outro', 'outro', true, true, 99)
) AS v("tipo", "nome", "codigo", "exige_texto", "sistema", "ordem");

-- Histórico dos cancelamentos que já existem (R §34: nada some do relatório). Contratos, períodos
-- e negócios perdidos têm o motivo gravado (texto livre ou lista); os demais entram sem motivo
-- conhecido, como "Outro" com a observação de que são anteriores ao registro.
INSERT INTO "cancelamentos" ("tipo", "entidade", "entidade_id", "motivo_id", "motivo_nome", "observacao", "cancelado_em", "profissional_id")
SELECT 'CONTRATO', 'ContratoSala', c."id", m."id", m."nome", c."motivo_encerramento",
       COALESCE(c."encerrado_em"::timestamptz, c."updated_at"), c."profissional_id"
FROM "contratos_sala" c
JOIN "motivos_cancelamento" m ON m."tipo" = 'CONTRATO' AND m."codigo" = 'outro'
WHERE c."status" = 'CANCELADO' AND c."deleted_at" IS NULL;

INSERT INTO "cancelamentos" ("tipo", "entidade", "entidade_id", "motivo_id", "motivo_nome", "observacao", "cancelado_por_id", "cancelado_em", "profissional_id")
SELECT 'PERIODO', 'SalaBloqueio', b."id", m."id", m."nome", b."motivo_cancelamento", b."cancelado_por_id", b."cancelado_em", b."profissional_id"
FROM "salas_bloqueio" b
JOIN "motivos_cancelamento" m ON m."tipo" = 'PERIODO' AND m."codigo" = 'outro'
WHERE b."cancelado_em" IS NOT NULL;

INSERT INTO "cancelamentos" ("tipo", "entidade", "entidade_id", "motivo_id", "motivo_nome", "observacao", "cancelado_em")
SELECT 'PROPOSTA', 'Negocio', n."id", NULL, mp."nome", NULL, COALESCE(n."fechado_em", n."updated_at")
FROM "negocios" n
JOIN "motivos_perda" mp ON mp."id" = n."motivo_perda_id"
WHERE n."status" = 'PERDIDO' AND n."deleted_at" IS NULL;

INSERT INTO "cancelamentos" ("tipo", "entidade", "entidade_id", "motivo_id", "motivo_nome", "observacao", "cancelado_em", "profissional_id")
SELECT 'CONSULTA', 'Agendamento', a."id", m."id", m."nome", 'Cancelamento anterior ao registro de motivos', a."updated_at", a."profissional_id"
FROM "agendamentos" a
JOIN "motivos_cancelamento" m ON m."tipo" = 'CONSULTA' AND m."codigo" = 'outro'
WHERE a."status" = 'CANCELADO' AND a."deleted_at" IS NULL;

INSERT INTO "cancelamentos" ("tipo", "entidade", "entidade_id", "motivo_id", "motivo_nome", "observacao", "cancelado_em")
SELECT 'PROPOSTA', 'Orcamento', o."id", m."id", m."nome", 'Cancelamento anterior ao registro de motivos', o."updated_at"
FROM "orcamentos" o
JOIN "motivos_cancelamento" m ON m."tipo" = 'PROPOSTA' AND m."codigo" = 'outro'
WHERE o."status" = 'CANCELADO' AND o."deleted_at" IS NULL;

INSERT INTO "cancelamentos" ("tipo", "entidade", "entidade_id", "motivo_id", "motivo_nome", "observacao", "cancelado_em", "profissional_id")
SELECT 'COBRANCA', 'ContaReceber', r."id", m."id", m."nome", 'Cancelamento anterior ao registro de motivos', r."updated_at", r."profissional_id"
FROM "contas_receber" r
JOIN "motivos_cancelamento" m ON m."tipo" = 'COBRANCA' AND m."codigo" = 'outro'
WHERE r."status" = 'CANCELADO' AND r."deleted_at" IS NULL;

INSERT INTO "cancelamentos" ("tipo", "entidade", "entidade_id", "motivo_id", "motivo_nome", "observacao", "cancelado_em")
SELECT 'COBRANCA', 'ContaPagar', p."id", m."id", m."nome", 'Cancelamento anterior ao registro de motivos', p."updated_at"
FROM "contas_pagar" p
JOIN "motivos_cancelamento" m ON m."tipo" = 'COBRANCA' AND m."codigo" = 'outro'
WHERE p."status" = 'CANCELADO' AND p."deleted_at" IS NULL;

-- Tela Motivos de Cancelamento: o perfil Administrador dos ambientes que já existem recebe as
-- permissões novas (como na migration da exportação em lote, #158). Idempotente.
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao")
SELECT p."id", v."permissao"
FROM "perfis" p
JOIN (VALUES
  ('Administrador', 'configuracoes-gestao.motivos-cancelamento.ver'),
  ('Administrador', 'configuracoes-gestao.motivos-cancelamento.criar'),
  ('Administrador', 'configuracoes-gestao.motivos-cancelamento.editar'),
  ('Administrador', 'configuracoes-gestao.motivos-cancelamento.excluir'),
  ('Administrador', 'configuracoes-gestao.motivos-cancelamento.exportar')
) AS v("nome", "permissao") ON v."nome" = p."nome"
WHERE p."padrao" = true
ON CONFLICT DO NOTHING;
