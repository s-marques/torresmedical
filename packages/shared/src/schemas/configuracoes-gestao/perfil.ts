import { z } from 'zod';
import { ACAO_VER, TELAS, type TelaId } from '../../menu/menu';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const PERFIL_NOME_MAX = 120;
export const PERFIL_DESCRICAO_MAX = 255;

const TELAS_IDS: ReadonlySet<string> = new Set(TELAS.map((tela) => tela.id));

/** Permissão de acesso (`.ver`) de uma tela do menu, dada pelo id da tela. */
const paginaPermitida = z
  .string({ error: 'Página inválida' })
  .refine((valor): valor is TelaId => TELAS_IDS.has(valor), { error: 'Página inválida' });

/** Descrição livre; vazia vira `null`. */
const descricao = z
  .string({ error: 'Descrição inválida' })
  .trim()
  .max(PERFIL_DESCRICAO_MAX, {
    error: `Descrição deve ter no máximo ${PERFIL_DESCRICAO_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || null);

/**
 * Escopo de dados do perfil (issue #153; requisitos R §14 e §37). `TODOS`: vê os dados de
 * todos os profissionais. `PROFISSIONAIS_VINCULADOS`: vê só a agenda, os pacientes, o
 * prontuário e as salas dos profissionais vinculados ao usuário; sem vínculo, não vê nada.
 */
export const ESCOPOS_DADOS = ['TODOS', 'PROFISSIONAIS_VINCULADOS'] as const;
export type EscopoDadosPerfil = (typeof ESCOPOS_DADOS)[number];

export const ESCOPO_DADOS_LABELS: Readonly<Record<EscopoDadosPerfil, string>> = {
  TODOS: 'Todos os profissionais',
  PROFISSIONAIS_VINCULADOS: 'Somente os profissionais vinculados ao usuário',
};

export const escopoDadosSchema = z.enum(ESCOPOS_DADOS, { error: 'Escopo de dados inválido' });

/**
 * `POST` e `PATCH /api/configuracoes-gestao/perfis`. O modal Editar envia o formulário
 * inteiro (print do inventário), por isso create e update usam o mesmo schema. "Páginas
 * Permitidas" vira uma permissão `<tela>.ver` por página marcada.
 */
export const perfilInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: PERFIL_NOME_MAX }),
  descricao,
  paginasPermitidas: z
    .array(paginaPermitida)
    .min(1, { error: 'Selecione ao menos uma página.' })
    .transform((valor) => [...new Set(valor)]),
  escopoDados: escopoDadosSchema.default('TODOS'),
});

export type PerfilFormulario = z.input<typeof perfilInputSchema>;
export type CreatePerfilInput = z.output<typeof perfilInputSchema>;
export type UpdatePerfilInput = CreatePerfilInput;
export const createPerfilSchema = perfilInputSchema;
export const updatePerfilSchema = perfilInputSchema;

export const PERFIL_SORT_FIELDS = ['nome', 'createdAt'] as const;

/** `GET /api/configuracoes-gestao/perfis`. */
export const listPerfisQuerySchema = listQuerySchema({
  sortFields: PERFIL_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: ativoStatusSchema.optional() },
});

export type ListPerfisQuery = z.infer<typeof listPerfisQuerySchema>;

export const PERFIL_EXPORT_COLUMNS = ['nome', 'descricao', 'paginas', 'status'] as const;
export type PerfilExportColumn = (typeof PERFIL_EXPORT_COLUMNS)[number];

/** `GET /api/configuracoes-gestao/perfis/export`. */
export const exportPerfisQuerySchema = exportQuerySchema(
  listPerfisQuerySchema,
  PERFIL_EXPORT_COLUMNS,
);

export type ExportPerfisQuery = z.infer<typeof exportPerfisQuerySchema>;

export const perfilSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  descricao: z.string().nullable(),
  /** Ids de tela (`TelaId`) com permissão `.ver` concedida a este perfil. */
  paginasPermitidas: z.array(z.string()),
  escopoDados: escopoDadosSchema,
  /** Perfil padrão do sistema (issue #154): pode ser duplicado, mas não excluído. */
  padrao: z.boolean(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Perfil = z.infer<typeof perfilSchema>;

export const perfilPageSchema = paginatedResponseSchema(perfilSchema);

export type PerfilPage = z.infer<typeof perfilPageSchema>;

/** Total de páginas do sistema, para o "X de Y páginas" da coluna Páginas (grid e export). */
export const TOTAL_PAGINAS_SISTEMA = TELAS.length;

/** `<tela>.ver` a partir do id da tela, para gravar em `PerfilPermissao`. */
export function permissaoDaPagina(telaId: TelaId): string {
  return `${telaId}.${ACAO_VER}`;
}
