import { z } from 'zod';
import { ativoStatusSchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';

/**
 * Cancelamentos rastreáveis (issue #162; requisitos R §34 e §35). Nada é apagado: todo cancelamento
 * guarda quem, quando, o motivo (de uma lista por tipo), a observação e, na consulta, o novo registro.
 */
export const TIPOS_CANCELAMENTO = [
  'CONSULTA',
  'CONTRATO',
  'COBRANCA',
  'PERIODO',
  'PROPOSTA',
] as const;
export type TipoCancelamento = (typeof TIPOS_CANCELAMENTO)[number];

export const TIPO_CANCELAMENTO_ROTULO: Readonly<Record<TipoCancelamento, string>> = {
  CONSULTA: 'Consulta',
  CONTRATO: 'Contrato',
  COBRANCA: 'Cobrança',
  PERIODO: 'Período',
  PROPOSTA: 'Proposta',
};

export const tipoCancelamentoSchema = z.enum(TIPOS_CANCELAMENTO, { error: 'Tipo inválido' });

/** Entidade cancelada, como gravada em `cancelamentos.entidade`. */
export const ENTIDADES_CANCELAMENTO = [
  'Agendamento',
  'ContratoSala',
  'SalaBloqueio',
  'Orcamento',
  'Negocio',
  'ContaReceber',
  'ContaPagar',
] as const;
export type EntidadeCancelamento = (typeof ENTIDADES_CANCELAMENTO)[number];

/** Código do motivo de sistema "Outro": exige a observação e não pode ser removido. */
export const MOTIVO_CODIGO_OUTRO = 'outro';
/** Motivo de sistema usado quando o cancelamento de um contrato cancela as parcelas futuras. */
export const MOTIVO_CODIGO_CONTRATO_CANCELADO = 'contrato_cancelado';

export const MOTIVO_NOME_MAX = 120;
export const CANCELAMENTO_OBSERVACAO_MAX = 500;

const nomeMotivo = textoObrigatorio('Nome', { max: MOTIVO_NOME_MAX });

/** `POST /api/configuracoes-gestao/motivos-cancelamento`. */
export const createMotivoCancelamentoSchema = z.strictObject({
  tipo: tipoCancelamentoSchema,
  nome: nomeMotivo,
  exigeTexto: z.boolean({ error: 'Valor inválido' }).default(false),
});
export type CreateMotivoCancelamentoInput = z.output<typeof createMotivoCancelamentoSchema>;
export type MotivoCancelamentoFormulario = z.input<typeof createMotivoCancelamentoSchema>;

/** `PATCH /api/configuracoes-gestao/motivos-cancelamento/:id` (o tipo não muda). */
export const updateMotivoCancelamentoSchema = z
  .strictObject({
    nome: nomeMotivo.optional(),
    exigeTexto: z.boolean({ error: 'Valor inválido' }).optional(),
    ativo: z.boolean({ error: 'Valor inválido' }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });
export type UpdateMotivoCancelamentoInput = z.infer<typeof updateMotivoCancelamentoSchema>;

export const MOTIVO_SORT_FIELDS = ['nome', 'ordem'] as const;

/** `GET /api/configuracoes-gestao/motivos-cancelamento`. */
export const listMotivosCancelamentoQuerySchema = listQuerySchema({
  sortFields: MOTIVO_SORT_FIELDS,
  defaultSort: 'ordem:asc',
  filters: { status: ativoStatusSchema.optional(), tipo: tipoCancelamentoSchema.optional() },
});
export type ListMotivosCancelamentoQuery = z.infer<typeof listMotivosCancelamentoQuerySchema>;

export const motivoCancelamentoSchema = z.object({
  id: z.uuid(),
  tipo: tipoCancelamentoSchema,
  nome: z.string(),
  codigo: z.string(),
  exigeTexto: z.boolean(),
  /** Motivo de sistema: não pode ser desativado, excluído nem ter o texto obrigatório alterado. */
  sistema: z.boolean(),
  ordem: z.number().int(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MotivoCancelamento = z.infer<typeof motivoCancelamentoSchema>;

export const motivoCancelamentoPageSchema = paginatedResponseSchema(motivoCancelamentoSchema);

/** `GET /api/cancelamentos/motivos?tipo=`: motivos ativos do tipo, para o modal de cancelamento. */
export const motivosDoTipoQuerySchema = z.strictObject({ tipo: tipoCancelamentoSchema });
export type MotivosDoTipoQuery = z.infer<typeof motivosDoTipoQuerySchema>;

export const motivoOpcaoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  exigeTexto: z.boolean(),
});
export type MotivoOpcao = z.infer<typeof motivoOpcaoSchema>;
export const motivosDoTipoSchema = z.array(motivoOpcaoSchema);

const observacao = z
  .string({ error: 'Observação inválida' })
  .trim()
  .max(CANCELAMENTO_OBSERVACAO_MAX, {
    error: `A observação deve ter no máximo ${CANCELAMENTO_OBSERVACAO_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => (valor ? valor : undefined))
  // A chave pode faltar no objeto (só o valor é opcional): quem chama o service não precisa repassar `undefined`.
  .optional();

/**
 * Corpo do modal padrão de cancelamento (`POST …/:id/cancelar`): o motivo da lista é obrigatório;
 * a observação é obrigatória quando o motivo exige texto ("Outro"). Essa regra depende do banco e
 * é conferida no service. `reagendouParaId` (só na consulta) liga ao novo agendamento.
 */
export const cancelarComMotivoSchema = z.strictObject({
  motivoId: z.uuid({ error: erroObrigatorio('Motivo') }),
  observacao,
  // O select vazio manda '' (não reagendou).
  reagendouParaId: z
    .string({ error: 'Novo registro inválido' })
    .refine((valor) => valor === '' || z.uuid().safeParse(valor).success, {
      error: 'Novo registro inválido',
    })
    .nullish()
    .transform((valor) => valor || undefined)
    .optional(),
});
export type CancelarComMotivoInput = z.output<typeof cancelarComMotivoSchema>;
export type CancelarComMotivoFormulario = z.input<typeof cancelarComMotivoSchema>;

export const cancelamentoSchema = z.object({
  id: z.uuid(),
  tipo: tipoCancelamentoSchema,
  entidade: z.string(),
  entidadeId: z.uuid(),
  motivo: z.string(),
  observacao: z.string().nullable(),
  canceladoPorId: z.uuid().nullable(),
  canceladoEm: z.iso.datetime(),
  reagendouParaId: z.uuid().nullable(),
});
export type Cancelamento = z.infer<typeof cancelamentoSchema>;

/** Filtros do relatório de cancelamentos (GES-05), além do período De/Até. */
export const RELATORIO_CANCELAMENTOS_ID = 'GES-05';

/** Cancelamento sem reagendamento (cobrança, proposta, período, contrato): motivo e observação. */
export const cancelarSemReagendamentoSchema = cancelarComMotivoSchema.omit({
  reagendouParaId: true,
});
export type CancelarSemReagendamentoInput = z.output<typeof cancelarSemReagendamentoSchema>;
export type CancelarSemReagendamentoFormulario = z.input<typeof cancelarSemReagendamentoSchema>;
