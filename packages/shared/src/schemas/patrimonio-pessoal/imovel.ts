import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const IMOVEL_DESCRICAO_MAX = 200;
export const IMOVEL_ENDERECO_MAX = 300;
export const IMOVEL_MATRICULA_MAX = 100;
export const IMOVEL_BANCO_MAX = 100;
export const IMOVEL_OBSERVACOES_MAX = 2000;
export const IMOVEL_VALOR_MAX = 9_999_999_999.99;

/** Select "Tipo" do modal (lista do print do dev na #61; padrão Apartamento). */
export const IMOVEL_TIPOS = ['APARTAMENTO', 'SALA_COMERCIAL', 'TERRENO', 'CASA', 'GALPAO'] as const;
export const imovelTipoSchema = z.enum(IMOVEL_TIPOS);
export type ImovelTipo = z.infer<typeof imovelTipoSchema>;
/** Rótulos em português (exportação Excel/PDF). Na tela, o front traduz por `imoveis.tipos`. */
export const IMOVEL_TIPO_ROTULOS: Readonly<Record<ImovelTipo, string>> = {
  APARTAMENTO: 'Apartamento',
  SALA_COMERCIAL: 'Sala Comercial',
  TERRENO: 'Terreno',
  CASA: 'Casa',
  GALPAO: 'Galpão',
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

/** Valor em R$, opcional e não negativo (mensagens padrão do Zod, traduzidas). */
const valorOpcional = () =>
  z
    .number()
    .min(0)
    .max(IMOVEL_VALOR_MAX)
    .nullish()
    .transform((valor) => valor ?? null);

/** Data `AAAA-MM-DD` opcional: vazio vira `null`. */
const dataOpcional = () =>
  z
    .string()
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.iso.date().nullable());

/**
 * Corpo de `POST` e `PATCH /api/patrimonio-pessoal/imoveis` (modal "Novo Imóvel", seções Dados do
 * Imóvel, Financiamento e Despesas Mensais Vinculadas). O `PATCH` substitui todos os campos (o
 * modal Editar envia o formulário inteiro). Só a Descrição é obrigatória.
 */
export const imovelInputSchema = z.strictObject({
  // Dados do Imóvel
  descricao: textoObrigatorio('Descrição', { genero: 'f', max: IMOVEL_DESCRICAO_MAX }),
  tipo: imovelTipoSchema.default('APARTAMENTO'),
  endereco: textoOpcional(IMOVEL_ENDERECO_MAX, 'Endereço'),
  matricula: textoOpcional(IMOVEL_MATRICULA_MAX, 'Matrícula'),
  valorCompra: valorOpcional(),
  dataCompra: dataOpcional(),
  iptuAnual: valorOpcional(),
  itbiPago: valorOpcional(),
  // Financiamento
  banco: textoOpcional(IMOVEL_BANCO_MAX, 'Banco'),
  financiamentoParcela: valorOpcional(),
  saldoDevedor: valorOpcional(),
  vencimentoFinanciamento: dataOpcional(),
  // Despesas Mensais Vinculadas
  condominio: valorOpcional(),
  contaLuz: valorOpcional(),
  contaAgua: valorOpcional(),
  internet: valorOpcional(),
  seguro: valorOpcional(),
  observacoes: textoOpcional(IMOVEL_OBSERVACOES_MAX, 'Observações'),
});

export type ImovelFormInput = z.input<typeof imovelInputSchema>;
export type CreateImovelInput = z.output<typeof imovelInputSchema>;
export type UpdateImovelInput = CreateImovelInput;
export const createImovelSchema = imovelInputSchema;
export const updateImovelSchema = imovelInputSchema;

/** Campos que compõem a coluna "Desp. Mensal" (confirmado pelo dev na #61). */
export const IMOVEL_DESPESAS_MENSAIS = [
  'condominio',
  'contaLuz',
  'contaAgua',
  'internet',
  'seguro',
] as const;

/** Desp. Mensal: Condomínio + Conta Luz + Conta Água + Internet + Seguro (vazio conta 0). */
export function despesaMensalImovel(
  imovel: Readonly<Record<(typeof IMOVEL_DESPESAS_MENSAIS)[number], number | null>>,
): number {
  const centavos = IMOVEL_DESPESAS_MENSAIS.reduce(
    (total, campo) => total + Math.round((imovel[campo] ?? 0) * 100),
    0,
  );
  return centavos / 100;
}

/** Colunas ordenáveis do grid (Desp. Mensal é calculada e não ordena, como no inventário). */
export const IMOVEL_SORT_FIELDS = [
  'descricao',
  'tipo',
  'endereco',
  'valorCompra',
  'financiamentoParcela',
] as const;

/** `GET /api/patrimonio-pessoal/imoveis`: busca "Buscar imóveis..." (`search`) e ordenação. */
export const listImoveisQuerySchema = listQuerySchema({
  sortFields: IMOVEL_SORT_FIELDS,
  defaultSort: 'descricao:asc',
  filters: {},
});

export type ListImoveisQuery = z.infer<typeof listImoveisQuerySchema>;

export const IMOVEL_EXPORT_COLUMNS = [
  'descricao',
  'tipo',
  'endereco',
  'valorCompra',
  'financiamentoParcela',
  'despesaMensal',
] as const;
export type ImovelExportColumn = (typeof IMOVEL_EXPORT_COLUMNS)[number];

/** `GET /api/patrimonio-pessoal/imoveis/export`. */
export const exportImoveisQuerySchema = exportQuerySchema(
  listImoveisQuerySchema,
  IMOVEL_EXPORT_COLUMNS,
);

export type ExportImoveisQuery = z.infer<typeof exportImoveisQuerySchema>;

const texto = z.string().nullable();
const valor = z.number().nullable();

export const imovelSchema = z.object({
  id: z.uuid(),
  descricao: z.string(),
  tipo: imovelTipoSchema,
  endereco: texto,
  matricula: texto,
  valorCompra: valor,
  dataCompra: z.iso.date().nullable(),
  iptuAnual: valor,
  itbiPago: valor,
  banco: texto,
  financiamentoParcela: valor,
  saldoDevedor: valor,
  vencimentoFinanciamento: z.iso.date().nullable(),
  condominio: valor,
  contaLuz: valor,
  contaAgua: valor,
  internet: valor,
  seguro: valor,
  /** Calculada: soma das despesas mensais vinculadas (`despesaMensalImovel`). */
  despesaMensal: z.number(),
  observacoes: texto,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Imovel = z.infer<typeof imovelSchema>;

export const imovelPageSchema = paginatedResponseSchema(imovelSchema);

export type ImovelPage = z.infer<typeof imovelPageSchema>;
