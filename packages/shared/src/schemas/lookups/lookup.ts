import { z } from 'zod';
import type { Permissao } from '../../auth/permissoes';
import type { TelaId } from '../../menu/menu';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Consultas (lookups) das entidades compartilhadas, para os combobox das telas:
 * `GET /api/lookups/<entidade>?search=&page=&pageSize=&<filtros>` e `GET /api/lookups/<entidade>/:id`.
 * Cada entidade pertence ao módulo dono (CLAUDE.md, seção 3), que expõe o lookup.
 */
export const LOOKUP_ENTIDADES = [
  'pacientes',
  'profissionais',
  'especialidades',
  'empresas',
  'unidades',
  'fornecedores',
  'produtos',
  'categorias',
  'unidades-medida',
  'funcionarios',
  'cargos',
  'formas-pagamento',
  'tipos-agendamento',
  'origens-cliente',
  'perfis',
  'canais-whatsapp',
  'usuarios',
] as const;

export type LookupEntidade = (typeof LOOKUP_ENTIDADES)[number];

/** Caminho do lookup na API (sem o id). */
export function lookupPath(entidade: LookupEntidade): `/api/lookups/${LookupEntidade}` {
  return `/api/lookups/${entidade}`;
}

/** Item do combobox: `label` é o texto principal e `descricao`, o secundário (ex.: especialidade). */
export const lookupItemSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  descricao: z.string().nullable(),
});

export type LookupItem = z.infer<typeof lookupItemSchema>;

export const lookupPageSchema = paginatedResponseSchema(lookupItemSchema);

export type LookupPage = z.infer<typeof lookupPageSchema>;

/** Produto ou serviço (Produtos/Serviços e Categorias). */
export const TIPOS_ITEM = ['produto', 'servico'] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];

/** Finalidade da forma de pagamento (Receber ou Pagar). */
export const FINALIDADES_PAGAMENTO = ['receber', 'pagar'] as const;
export type FinalidadePagamento = (typeof FINALIDADES_PAGAMENTO)[number];

const tipoItem = z.enum(TIPOS_ITEM, { error: 'Tipo deve ser produto ou servico' }).optional();

function lookupQuerySchema<E extends z.ZodRawShape>(filters: E) {
  return listQuerySchema({ sortFields: ['nome'], defaultSort: 'nome:asc', filters });
}

/** Query de cada lookup: busca, paginação e os filtros que as telas precisam. */
export const lookupQuerySchemas = {
  pacientes: lookupQuerySchema({}),
  profissionais: lookupQuerySchema({
    especialidadeId: z.uuid({ error: 'Especialidade inválida' }).optional(),
  }),
  especialidades: lookupQuerySchema({}),
  empresas: lookupQuerySchema({}),
  unidades: lookupQuerySchema({ empresaId: z.uuid({ error: 'Empresa inválida' }).optional() }),
  fornecedores: lookupQuerySchema({}),
  produtos: lookupQuerySchema({ tipo: tipoItem }),
  categorias: lookupQuerySchema({ tipo: tipoItem }),
  'unidades-medida': lookupQuerySchema({}),
  funcionarios: lookupQuerySchema({}),
  cargos: lookupQuerySchema({}),
  'formas-pagamento': lookupQuerySchema({
    finalidade: z
      .enum(FINALIDADES_PAGAMENTO, { error: 'Finalidade deve ser receber ou pagar' })
      .optional(),
  }),
  'tipos-agendamento': lookupQuerySchema({}),
  'origens-cliente': lookupQuerySchema({}),
  perfis: lookupQuerySchema({}),
  'canais-whatsapp': lookupQuerySchema({}),
  usuarios: lookupQuerySchema({}),
} satisfies Record<LookupEntidade, z.ZodType>;

export type LookupQuery<E extends LookupEntidade = LookupEntidade> = z.infer<
  (typeof lookupQuerySchemas)[E]
>;

type PermissoesLookup = readonly [Permissao, ...Permissao[]];

function telas(...ids: [TelaId, ...TelaId[]]): PermissoesLookup {
  const [primeira, ...demais] = ids;
  return [`${primeira}.ver`, ...demais.map((id): Permissao => `${id}.ver`)];
}

const PACIENTE = telas(
  'comercial-atendimento.pacientes',
  'comercial-atendimento.agenda',
  'comercial-atendimento.negocios',
  'comercial-atendimento.orcamentos',
  'comercial-atendimento.vendas-pdv',
  'comercial-atendimento.pacotes',
  'comercial-atendimento.mensalidades',
  'consultorio-assistencial.prontuarios',
  'consultorio-assistencial.atendimento-medico',
  'financeiro.contas-receber',
  'regulatorio-qualidade.fiscal',
  'gestao-profissionais.salas',
  'comercial-atendimento.whatsapp',
  'comercial-atendimento.pipeline',
);

const PROFISSIONAL = telas(
  'gestao-profissionais.profissionais',
  'gestao-profissionais.salas',
  'comercial-atendimento.agenda',
  'consultorio-assistencial.atendimento-medico',
  'consultorio-assistencial.receituarios',
  'gestao-profissionais.protocolos',
  'gestao-profissionais.receita-profissionais',
  'configuracoes-gestao.base-conhecimento',
  'comercial-atendimento.pipeline',
);

const EMPRESA = telas(
  'configuracoes-gestao.minha-empresa',
  'regulatorio-qualidade.alvaras-licencas',
);

const FORNECEDOR = telas(
  'compras-estoque.fornecedores',
  'compras-estoque.entrada-compras',
  'compras-estoque.estoque',
  'compras-estoque.pedidos-transito',
  'financeiro.contas-pagar',
);

const PRODUTO = telas(
  'compras-estoque.produtos-servicos',
  'compras-estoque.estoque',
  'compras-estoque.lotes-validade',
  'compras-estoque.baixa-insumos',
  'comercial-atendimento.vendas-pdv',
  'comercial-atendimento.orcamentos',
  'comercial-atendimento.pacotes',
);

const FUNCIONARIO = telas(
  'regulatorio-qualidade.funcionarios',
  'regulatorio-qualidade.treinamentos',
  'regulatorio-qualidade.coleta-residuos',
  'financeiro.contas-pagar',
);

/**
 * Quem pode consultar cada lookup: basta uma das permissões `ver` das telas que usam a
 * entidade (tabela da issue #81). A tela que passar a usar um lookup se acrescenta aqui.
 */
export const LOOKUP_PERMISSOES: Readonly<Record<LookupEntidade, PermissoesLookup>> = {
  pacientes: PACIENTE,
  profissionais: PROFISSIONAL,
  especialidades: PROFISSIONAL,
  empresas: EMPRESA,
  unidades: EMPRESA,
  fornecedores: FORNECEDOR,
  produtos: PRODUTO,
  categorias: [...PRODUTO, 'compras-estoque.categorias.ver'],
  'unidades-medida': PRODUTO,
  funcionarios: FUNCIONARIO,
  cargos: FUNCIONARIO,
  'formas-pagamento': telas(
    'financeiro.formas-pagamento',
    'financeiro.caixas',
    'financeiro.contas-receber',
    'financeiro.contas-pagar',
    'comercial-atendimento.vendas-pdv',
    'gestao-profissionais.receita-profissionais',
    'gestao-profissionais.salas',
  ),
  'tipos-agendamento': telas(
    'configuracoes-gestao.tipos-agendamento',
    'comercial-atendimento.agenda',
    'gestao-profissionais.profissionais',
  ),
  'origens-cliente': telas(
    'comercial-atendimento.origens-cliente',
    'comercial-atendimento.pacientes',
    'comercial-atendimento.pipeline',
  ),
  perfis: telas('configuracoes-gestao.usuarios', 'configuracoes-gestao.perfis-acesso'),
  'canais-whatsapp': telas('comercial-atendimento.whatsapp', 'configuracoes-gestao.agentes-ia'),
  usuarios: telas('comercial-atendimento.whatsapp', 'configuracoes-gestao.usuarios'),
};
