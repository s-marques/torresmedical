import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const BEM_DESCRICAO_MAX = 200;
export const BEM_TEXTO_MAX = 100;
export const BEM_VALOR_MAX = 9_999_999_999.99;
export const BEM_ANO_MAX = 9999;

/** Select "Tipo" do modal e do filtro (dropdown do inventário; padrão Automóvel). */
export const BEM_TIPOS = ['AUTOMOVEL', 'IMOVEL_URBANO', 'IMOVEL_RURAL', 'BEM_MOVEL'] as const;
export const bemTipoSchema = z.enum(BEM_TIPOS);
export type BemTipo = z.infer<typeof bemTipoSchema>;
/** Rótulos em português (exportação Excel/PDF). Na tela, o front traduz por `patrimonio.tipos`. */
export const BEM_TIPO_ROTULOS: Readonly<Record<BemTipo, string>> = {
  AUTOMOVEL: 'Automóvel',
  IMOVEL_URBANO: 'Imóvel Urbano',
  IMOVEL_RURAL: 'Imóvel Rural',
  BEM_MOVEL: 'Bem Móvel',
};

/** Texto opcional: vazio vira `null`. */
const textoOpcional = (max: number, rotulo: string) =>
  z
    .string()
    .trim()
    .max(max, {
      error: () => traduzirValidacao('validacao.campoMax', { campo: rotulo, count: max }),
    })
    .nullish()
    .transform((valor) => valor || null);

const valorOpcional = () =>
  z
    .number()
    .min(0)
    .max(BEM_VALOR_MAX)
    .nullish()
    .transform((valor) => valor ?? null);

const dataOpcional = () =>
  z
    .string()
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.iso.date().nullable());

/**
 * Corpo de `POST` e `PATCH /api/patrimonio-pessoal/patrimonio` (modal "Novo Bem"). O `PATCH`
 * substitui todos os campos. Só a Descrição é obrigatória. A seção "Dados do Veículo" (marca,
 * modelo, ano, placa, RENAVAM, Financiado e Possui Seguro) só vale para o tipo Automóvel: nos
 * demais tipos o service a descarta.
 */
export const bemInputSchema = z.strictObject({
  /** "Vincular a Produto (opcional)": só o id, sem FK (o produto é de compras-estoque). */
  produtoId: z
    .uuid()
    .nullish()
    .transform((valor) => valor ?? null),
  descricao: textoObrigatorio('Descrição', { genero: 'f', max: BEM_DESCRICAO_MAX }),
  tipo: bemTipoSchema.default('AUTOMOVEL'),
  valorCompra: valorOpcional(),
  dataAquisicao: dataOpcional(),
  marca: textoOpcional(BEM_TEXTO_MAX, 'Marca'),
  modelo: textoOpcional(BEM_TEXTO_MAX, 'Modelo'),
  ano: z
    .number()
    .int()
    .min(0)
    .max(BEM_ANO_MAX)
    .nullish()
    .transform((valor) => valor ?? null),
  placa: textoOpcional(BEM_TEXTO_MAX, 'Placa'),
  renavam: textoOpcional(BEM_TEXTO_MAX, 'RENAVAM'),
  financiado: z.boolean().default(false),
  possuiSeguro: z.boolean().default(false),
});

export type BemFormInput = z.input<typeof bemInputSchema>;
export type CreateBemInput = z.output<typeof bemInputSchema>;
export type UpdateBemInput = CreateBemInput;
export const createBemSchema = bemInputSchema;
export const updateBemSchema = bemInputSchema;

/** Colunas ordenáveis do grid. "Impostos Pend." não ordena: ainda não há cadastro de impostos. */
export const BEM_SORT_FIELDS = [
  'descricao',
  'tipo',
  'valorCompra',
  'valorAtual',
  'dataAquisicao',
] as const;

/** `GET /api/patrimonio-pessoal/patrimonio`: busca "Buscar bens...", filtro Tipo e ordenação. */
export const listBensQuerySchema = listQuerySchema({
  sortFields: BEM_SORT_FIELDS,
  defaultSort: 'descricao:asc',
  filters: { tipo: bemTipoSchema.optional() },
});
export type ListBensQuery = z.infer<typeof listBensQuerySchema>;

export const BEM_EXPORT_COLUMNS = [
  'descricao',
  'tipo',
  'valorCompra',
  'valorAtual',
  'dataAquisicao',
  'impostosPendentes',
] as const;
export type BemExportColumn = (typeof BEM_EXPORT_COLUMNS)[number];

/** `GET /api/patrimonio-pessoal/patrimonio/export`. */
export const exportBensQuerySchema = exportQuerySchema(listBensQuerySchema, BEM_EXPORT_COLUMNS);
export type ExportBensQuery = z.infer<typeof exportBensQuerySchema>;

const texto = z.string().nullable();
const valor = z.number().nullable();

export const bemSchema = z.object({
  id: z.uuid(),
  produtoId: z.uuid().nullable(),
  descricao: z.string(),
  tipo: bemTipoSchema,
  valorCompra: valor,
  /** Sem campo no modal do inventário; fica vazio até a regra ser confirmada. */
  valorAtual: valor,
  dataAquisicao: z.iso.date().nullable(),
  marca: texto,
  modelo: texto,
  ano: z.number().int().nullable(),
  placa: texto,
  renavam: texto,
  financiado: z.boolean(),
  possuiSeguro: z.boolean(),
  /** Coluna "Impostos Pend.": 0 até existir o cadastro de impostos/taxas. */
  impostosPendentes: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Bem = z.infer<typeof bemSchema>;

export const bemPageSchema = paginatedResponseSchema(bemSchema);
export type BemPage = z.infer<typeof bemPageSchema>;

/** `GET /api/patrimonio-pessoal/patrimonio/resumo`: os 3 cartões do topo da tela. */
export const resumoPatrimonioSchema = z.object({
  /** Soma do Valor Atual (ou do Valor Compra, quando o atual está vazio). */
  valorTotal: z.number(),
  impostosPendentes: z.number().int(),
  alertasProximos: z.number().int(),
});
export type ResumoPatrimonio = z.infer<typeof resumoPatrimonioSchema>;

/** Valor de um bem no patrimônio: o atual, ou o de compra enquanto o atual não existe. */
export function valorDoBem(bem: Pick<Bem, 'valorAtual' | 'valorCompra'>): number {
  return bem.valorAtual ?? bem.valorCompra ?? 0;
}
