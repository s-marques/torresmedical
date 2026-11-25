import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'EXPORT'] as const;

export const auditActionSchema = z.enum(AUDIT_ACTIONS, { error: 'Ação inválida' });

export type AuditAction = z.infer<typeof auditActionSchema>;

/**
 * Atalhos para os eventos destacados no requisito do cliente (R §15, issue #155). Cada atalho
 * vira um filtro de ação, de entidades e/ou de status final no `audit_log`. A lista de entidades
 * é uma inferência do dev a partir do requisito: ajuste aqui ao nascer uma entidade nova.
 */
export const AUDIT_GRUPOS = [
  'exclusoes',
  'cancelamentos',
  'descontos',
  'financeiro',
  'agenda',
  'sala',
  'contrato',
  'prontuario',
] as const;

export const auditGrupoSchema = z.enum(AUDIT_GRUPOS, { error: 'Atalho inválido' });

export type AuditGrupo = z.infer<typeof auditGrupoSchema>;

export interface AuditGrupoDefinicao {
  /** Só registros dessa ação. */
  action?: AuditAction;
  /** Só registros dessas entidades. */
  entities?: readonly string[];
  /** Só alterações que deixaram o campo `status` num destes valores (ex.: cancelamentos). */
  statusFinal?: readonly string[];
}

/** Entidades clínicas: o conteúdo do diff só aparece para quem pode ver o prontuário. */
export const AUDIT_ENTIDADES_CLINICAS = [
  'Prontuario',
  'Atendimento',
  'AtendimentoEvolucao',
  'AtendimentoReceita',
  'Anamnese',
] as const;

export const AUDIT_GRUPOS_DEFINICAO: Readonly<Record<AuditGrupo, AuditGrupoDefinicao>> = {
  exclusoes: { action: 'DELETE' },
  cancelamentos: { action: 'UPDATE', statusFinal: ['CANCELADO', 'CANCELADA'] },
  descontos: { entities: ['Orcamento', 'Venda', 'Compra', 'ContaPagarBaixa'] },
  financeiro: {
    entities: [
      'ContaReceber',
      'ContaPagar',
      'ContaPagarBaixa',
      'AgendamentoRecebimento',
      'Caixa',
      'ContaBancaria',
      'Mensalidade',
      'MensalidadeTitulo',
      'Venda',
      'FormaPagamento',
      'PlanoConta',
    ],
  },
  agenda: { entities: ['Agendamento', 'BloqueioAgenda'] },
  sala: { entities: ['Sala', 'SalaBloqueio'] },
  contrato: { entities: ['ContratoSala', 'ContratoSalaHora'] },
  prontuario: { entities: AUDIT_ENTIDADES_CLINICAS },
};

/** Fuso da clínica (sem horário de verão): os filtros De/Até por dia usam este deslocamento. */
const FUSO_CLINICA = '-03:00';

const optionalText = z.string().trim().min(1).max(200).optional();

/**
 * Instante com fuso (`2026-10-14T00:00:00-03:00`) ou dia inteiro `AAAA-MM-DD` (o filtro de
 * período da tela), que vale do começo ao fim do dia no fuso da clínica.
 */
function instante(fimDoDia: boolean) {
  return z
    .union([z.iso.date(), z.iso.datetime({ offset: true })], { error: 'Data/hora inválida' })
    .transform((valor) => {
      if (valor.length > 10) return new Date(valor);
      return new Date(
        fimDoDia ? `${valor}T23:59:59.999${FUSO_CLINICA}` : `${valor}T00:00:00.000${FUSO_CLINICA}`,
      );
    })
    .optional();
}

export const AUDIT_LOG_SORT_FIELDS = ['occurredAt', 'entity', 'action'] as const;

const periodoValido = (query: { de?: Date; ate?: Date }) =>
  !query.de || !query.ate || query.de <= query.ate;

const ERRO_PERIODO = {
  error: 'A data inicial deve ser anterior ou igual à final',
  path: ['ate'],
};

const auditLogListSchema = listQuerySchema({
  sortFields: AUDIT_LOG_SORT_FIELDS,
  defaultSort: 'occurredAt:desc',
  filters: {
    entity: optionalText,
    entityId: optionalText,
    userId: optionalText,
    action: auditActionSchema.optional(),
    grupo: auditGrupoSchema.optional(),
    de: instante(false),
    ate: instante(true),
  },
});

/**
 * Filtros de `GET /api/auditoria`. `search` procura no nome da entidade e no id do registro.
 * Filtros combinados valem todos ao mesmo tempo (E).
 */
export const auditLogQuerySchema = auditLogListSchema.refine(periodoValido, ERRO_PERIODO);

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const AUDIT_LOG_EXPORT_COLUMNS = [
  'data',
  'usuario',
  'acao',
  'entidade',
  'registro',
  'campos',
] as const;
export type AuditLogExportColumn = (typeof AUDIT_LOG_EXPORT_COLUMNS)[number];

/**
 * `GET /api/auditoria/export`. Exporta só metadados (quem, quando, ação, entidade, registro e
 * nomes dos campos alterados), nunca o conteúdo de antes e depois.
 */
export const exportAuditLogQuerySchema = exportQuerySchema(
  auditLogListSchema,
  AUDIT_LOG_EXPORT_COLUMNS,
).refine(periodoValido, ERRO_PERIODO);

export type ExportAuditLogQuery = z.infer<typeof exportAuditLogQuerySchema>;

export const auditLogSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  /** Nome do usuário; nulo para `system`, `anonymous` ou usuário que não existe mais. */
  userNome: z.string().nullable().default(null),
  occurredAt: z.iso.datetime(),
  action: auditActionSchema,
  entity: z.string(),
  entityId: z.string(),
  /** `null` quando `restrito`. */
  before: z.unknown(),
  /** `null` quando `restrito`. */
  after: z.unknown(),
  /** Campos que mudaram (todos, em CREATE e DELETE). Valem mesmo com o conteúdo restrito. */
  campos: z.array(z.string()).default([]),
  /** Conteúdo clínico omitido: o usuário não pode ver o prontuário. */
  restrito: z.boolean().default(false),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
});

export type AuditLogItem = z.infer<typeof auditLogSchema>;

export const auditLogPageSchema = paginatedResponseSchema(auditLogSchema);

export type AuditLogPage = z.infer<typeof auditLogPageSchema>;

/** `GET /api/auditoria/entidades`: nomes das entidades que já têm registro, para o filtro. */
export const auditEntidadesSchema = z.object({ data: z.array(z.string()) });

export type AuditEntidades = z.infer<typeof auditEntidadesSchema>;

export interface AuditDiffCampo {
  campo: string;
  antes: unknown;
  depois: unknown;
}

/** Campos que mudam a cada gravação e não dizem nada ao auditor. */
const CAMPOS_IGNORADOS: ReadonlySet<string> = new Set(['updatedAt', 'createdAt']);

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * Diff campo a campo (nível raiz) entre `before` e `after`. Em CREATE (sem `before`) e DELETE
 * (sem `after`) lista todos os campos. Valores aninhados são comparados pelo JSON.
 */
export function diffAuditoria(before: unknown, after: unknown): AuditDiffCampo[] {
  const antes = objeto(before);
  const depois = objeto(after);
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...campos]
    .filter((campo) => !CAMPOS_IGNORADOS.has(campo))
    .filter((campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]))
    .map((campo) => ({ campo, antes: antes[campo] ?? null, depois: depois[campo] ?? null }));
}
