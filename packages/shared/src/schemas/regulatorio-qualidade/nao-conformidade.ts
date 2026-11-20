import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio, erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Tela Não Conformidades (`/nao-conformidades`): registro e acompanhamento de não conformidades
 * e ações corretivas. Abas/chips de status: Todas, Aberta, Em Tratamento, Corrigida e Fechada.
 *
 * Pendente de confirmação do dev (issue #68): as opções do combo "Tipo" (o inventário só mostra
 * "Selecione...") e como o status avança (o inventário não capturou Editar nem ações de linha).
 * Por ora a NC nasce "Aberta".
 */
export const NAO_CONFORMIDADE_STATUS = ['aberta', 'em-tratamento', 'corrigida', 'fechada'] as const;
export const naoConformidadeStatusSchema = z.enum(NAO_CONFORMIDADE_STATUS);
export type NaoConformidadeStatus = z.infer<typeof naoConformidadeStatusSchema>;

export const NAO_CONFORMIDADE_TIPOS = [
  'processo',
  'produto',
  'servico',
  'documental',
  'seguranca',
] as const;
export const naoConformidadeTipoSchema = z.enum(NAO_CONFORMIDADE_TIPOS, {
  error: erroObrigatorio('Tipo'),
});
export type NaoConformidadeTipo = z.infer<typeof naoConformidadeTipoSchema>;

export const NAO_CONFORMIDADE_TITULO_MAX = 200;

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const dataOpcional = (rotulo: string) =>
  z
    .union([z.literal(''), z.iso.date({ error: `${rotulo} inválida` })])
    .nullish()
    .transform((valor) => valor || null);

/** Corpo de `POST /api/regulatorio-qualidade/nao-conformidades`. Obrigatórios: Título e Tipo. */
export const naoConformidadeInputSchema = z.strictObject({
  titulo: textoObrigatorio('Título', { max: NAO_CONFORMIDADE_TITULO_MAX }),
  descricao: textoOpcional(2000, 'Descrição'),
  setor: textoOpcional(150, 'Setor'),
  tipo: naoConformidadeTipoSchema,
  dataOcorrencia: dataOpcional('Data Ocorrência'),
  dataLimiteCorrecao: dataOpcional('Data Limite Correção'),
  responsavel: textoOpcional(150, 'Responsável'),
  acaoCorretiva: textoOpcional(2000, 'Ação Corretiva'),
  observacoes: textoOpcional(2000, 'Observações'),
});

export type NaoConformidadeFormInput = z.input<typeof naoConformidadeInputSchema>;
export type CreateNaoConformidadeInput = z.output<typeof naoConformidadeInputSchema>;
export const createNaoConformidadeSchema = naoConformidadeInputSchema;

export const NAO_CONFORMIDADE_SORT_FIELDS = [
  'titulo',
  'setor',
  'tipo',
  'dataOcorrencia',
  'responsavel',
  'status',
] as const;

export const listNaoConformidadesQuerySchema = listQuerySchema({
  sortFields: NAO_CONFORMIDADE_SORT_FIELDS,
  defaultSort: 'dataOcorrencia:desc',
  filters: { status: naoConformidadeStatusSchema.optional() },
});
export type ListNaoConformidadesQuery = z.infer<typeof listNaoConformidadesQuerySchema>;

export const NAO_CONFORMIDADE_EXPORT_COLUMNS = NAO_CONFORMIDADE_SORT_FIELDS;
export type NaoConformidadeExportColumn = (typeof NAO_CONFORMIDADE_EXPORT_COLUMNS)[number];

export const exportNaoConformidadesQuerySchema = exportQuerySchema(
  listNaoConformidadesQuerySchema,
  NAO_CONFORMIDADE_EXPORT_COLUMNS,
);
export type ExportNaoConformidadesQuery = z.infer<typeof exportNaoConformidadesQuerySchema>;

const texto = z.string().nullable();

export const naoConformidadeSchema = z.object({
  id: z.uuid(),
  titulo: z.string(),
  descricao: texto,
  setor: texto,
  tipo: naoConformidadeTipoSchema,
  /** `YYYY-MM-DD`. */
  dataOcorrencia: texto,
  /** `YYYY-MM-DD`. */
  dataLimiteCorrecao: texto,
  responsavel: texto,
  acaoCorretiva: texto,
  observacoes: texto,
  status: naoConformidadeStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type NaoConformidade = z.infer<typeof naoConformidadeSchema>;

export const naoConformidadePageSchema = paginatedResponseSchema(naoConformidadeSchema);
export type NaoConformidadePage = z.infer<typeof naoConformidadePageSchema>;
