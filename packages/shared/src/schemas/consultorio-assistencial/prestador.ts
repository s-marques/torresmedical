import { z } from 'zod';
import { cnpjValido, cpfValido } from '../comercial-atendimento/paciente';
import { exportQuerySchema, listQuerySchema, SEARCH_MAX_LENGTH } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const PRESTADOR_NOME_MAX = 200;
export const PRESTADOR_ENDERECO_MAX = 300;
export const PRESTADOR_CHAVE_PIX_MAX = 140;
export const PRESTADOR_TEXTO_LONGO_MAX = 2000;
export const PRESTADOR_VALOR_MAX = 9_999_999.99;

/** Chips Ativo/Inativo/Bloqueado do grid e select "Status" da aba Dados (padrão Ativo). */
export const PRESTADOR_STATUS = ['ATIVO', 'INATIVO', 'BLOQUEADO'] as const;
export const prestadorStatusSchema = z.enum(PRESTADOR_STATUS, { error: 'Status inválido' });
export type PrestadorStatus = z.infer<typeof prestadorStatusSchema>;
export const PRESTADOR_STATUS_ROTULOS: Readonly<Record<PrestadorStatus, string>> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  BLOQUEADO: 'Bloqueado',
};

/** Select "Tipo Pessoa" da aba Dados (padrão Pessoa Física). */
export const PRESTADOR_TIPOS_PESSOA = ['FISICA', 'JURIDICA'] as const;
export const prestadorTipoPessoaSchema = z.enum(PRESTADOR_TIPOS_PESSOA, {
  error: 'Tipo pessoa inválido',
});
export type PrestadorTipoPessoa = z.infer<typeof prestadorTipoPessoaSchema>;
export const PRESTADOR_TIPO_PESSOA_ROTULOS: Readonly<Record<PrestadorTipoPessoa, string>> = {
  FISICA: 'Pessoa Física',
  JURIDICA: 'Pessoa Jurídica',
};

/** Filtro "Todas categorias" e select "Categoria" da aba Serviço (inventário; padrão Elétrica). */
export const PRESTADOR_CATEGORIAS = [
  'ELETRICA',
  'HIDRAULICA',
  'PINTURA',
  'AR_CONDICIONADO',
  'JARDINAGEM',
  'SERRALHERIA',
  'MARCENARIA',
  'GESSO',
  'DEDETIZACAO',
  'LIMPEZA_CAIXA',
  'TI',
  'REFRIGERACAO',
  'OUTROS',
] as const;
export const prestadorCategoriaSchema = z.enum(PRESTADOR_CATEGORIAS, {
  error: 'Categoria inválida',
});
export type PrestadorCategoria = z.infer<typeof prestadorCategoriaSchema>;
export const PRESTADOR_CATEGORIA_ROTULOS: Readonly<Record<PrestadorCategoria, string>> = {
  ELETRICA: 'Elétrica',
  HIDRAULICA: 'Hidráulica',
  PINTURA: 'Pintura',
  AR_CONDICIONADO: 'Ar Condicionado',
  JARDINAGEM: 'Jardinagem',
  SERRALHERIA: 'Serralheria',
  MARCENARIA: 'Marcenaria',
  GESSO: 'Gesso',
  DEDETIZACAO: 'Dedetização',
  LIMPEZA_CAIXA: 'Limpeza Caixa',
  TI: 'TI',
  REFRIGERACAO: 'Refrigeração',
  OUTROS: 'Outros',
};

/** Select "Forma de Pagamento" da aba Comercial (lista confirmada pelo dev na #40; padrão PIX). */
export const PRESTADOR_FORMAS_PAGAMENTO = [
  'PIX',
  'TRANSFERENCIA',
  'BOLETO',
  'DINHEIRO',
  'CARTAO',
] as const;
export const prestadorFormaPagamentoSchema = z.enum(PRESTADOR_FORMAS_PAGAMENTO, {
  error: 'Forma de pagamento inválida',
});
export type PrestadorFormaPagamento = z.infer<typeof prestadorFormaPagamentoSchema>;
export const PRESTADOR_FORMA_PAGAMENTO_ROTULOS: Readonly<Record<PrestadorFormaPagamento, string>> =
  {
    PIX: 'PIX',
    TRANSFERENCIA: 'Transferência',
    BOLETO: 'Boleto',
    DINHEIRO: 'Dinheiro',
    CARTAO: 'Cartão',
  };

/** Notas 1 a 5 de "Qualidade do Serviço" e "Pontualidade" (confirmadas pelo dev na #40). */
export const PRESTADOR_NOTA_MIN = 1;
export const PRESTADOR_NOTA_MAX = 5;
export const PRESTADOR_NOTA_PADRAO = 3;
export const PRESTADOR_NOTA_ROTULOS: Readonly<Record<number, string>> = {
  1: 'Péssimo',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Ótimo',
};

/** "3 - Regular", como no select da aba Avaliação e na coluna Avaliação do grid. */
export function rotuloNotaPrestador(nota: number): string {
  const rotulo = PRESTADOR_NOTA_ROTULOS[nota];
  return rotulo ? `${nota} - ${rotulo}` : String(nota);
}

/** Select "Avaliação de Preço" da aba Avaliação (padrão Justo). */
export const PRESTADOR_AVALIACOES_PRECO = ['BARATO', 'JUSTO', 'CARO'] as const;
export const prestadorAvaliacaoPrecoSchema = z.enum(PRESTADOR_AVALIACOES_PRECO, {
  error: 'Avaliação de preço inválida',
});
export type PrestadorAvaliacaoPreco = z.infer<typeof prestadorAvaliacaoPrecoSchema>;
export const PRESTADOR_AVALIACAO_PRECO_ROTULOS: Readonly<Record<PrestadorAvaliacaoPreco, string>> =
  {
    BARATO: 'Barato',
    JUSTO: 'Justo',
    CARO: 'Caro',
  };

/** Texto opcional: vazio vira `null`. */
const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

/** Campo só de dígitos (telefone, CPF/CNPJ): aceita máscara e guarda só os dígitos. */
const digitosOpcional = (rotulo: string, tamanhos: readonly number[]) =>
  z
    .string({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => (valor ? valor.replaceAll(/\D/g, '') : null))
    .transform((valor) => valor || null)
    .refine((valor) => valor === null || tamanhos.includes(valor.length), {
      error: `${rotulo} inválido`,
    });

const valorOpcional = (rotulo: string) =>
  z
    .number({ error: `${rotulo} inválido` })
    .min(0, { error: `${rotulo} não pode ser negativo` })
    .max(PRESTADOR_VALOR_MAX, { error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => valor ?? null);

/** Nota 1 a 5. O select do formulário envia texto ("3"); a API aceita número ou texto. */
const nota = (rotulo: string) =>
  z.coerce
    .number<string | number>({ error: `${rotulo} inválida` })
    .int({ error: `${rotulo} inválida` })
    .min(PRESTADOR_NOTA_MIN, { error: `${rotulo} deve ser de 1 a 5` })
    .max(PRESTADOR_NOTA_MAX, { error: `${rotulo} deve ser de 1 a 5` })
    .default(PRESTADOR_NOTA_PADRAO);

const booleano = (rotulo: string) => z.boolean({ error: `${rotulo} inválido` }).default(false);

/**
 * Corpo de `POST` e `PATCH /api/consultorio-assistencial/prestadores` (modal "Novo Prestador",
 * abas Dados, Serviço, Comercial e Avaliação, prints do dev na #40). O `PATCH` substitui todos os
 * campos (o modal Editar envia o formulário inteiro). Só o Nome é obrigatório. O CPF/CNPJ, quando
 * preenchido, é CPF (11 dígitos) ou CNPJ (14) válido, como em Fornecedores. A Chave PIX só é
 * guardada quando a forma de pagamento é PIX.
 */
export const prestadorInputSchema = z
  .strictObject({
    // Dados
    nome: textoObrigatorio('Nome', { max: PRESTADOR_NOME_MAX }),
    nomeFantasia: textoOpcional(PRESTADOR_NOME_MAX, 'Nome Fantasia'),
    tipoPessoa: prestadorTipoPessoaSchema.default('FISICA'),
    documento: digitosOpcional('CPF/CNPJ', [11, 14]),
    telefone: digitosOpcional('Telefone', [10, 11]),
    email: z
      .union([z.literal(''), z.email({ error: 'Email inválido' })])
      .nullish()
      .transform((valor) => valor || null),
    status: prestadorStatusSchema.default('ATIVO'),
    endereco: textoOpcional(PRESTADOR_ENDERECO_MAX, 'Endereço'),
    // Serviço
    categoria: prestadorCategoriaSchema.default('ELETRICA'),
    descricaoServico: textoOpcional(PRESTADOR_TEXTO_LONGO_MAX, 'Descrição do Serviço'),
    atendeUrgencia: booleano('Atende Urgência'),
    atendeFimSemana: booleano('Atende Fim de Semana'),
    // Comercial
    formaPagamento: prestadorFormaPagamentoSchema.default('PIX'),
    chavePix: textoOpcional(PRESTADOR_CHAVE_PIX_MAX, 'Chave PIX'),
    valorHora: valorOpcional('Valor/Hora'),
    valorDiaria: valorOpcional('Valor/Diária'),
    emiteNotaFiscal: booleano('Emite Nota Fiscal'),
    // Avaliação
    notaQualidade: nota('Qualidade do Serviço'),
    notaPontualidade: nota('Pontualidade'),
    avaliacaoPreco: prestadorAvaliacaoPrecoSchema.default('JUSTO'),
    observacoes: textoOpcional(PRESTADOR_TEXTO_LONGO_MAX, 'Observações'),
  })
  .superRefine((dados, ctx) => {
    const { documento } = dados;
    // Tamanho errado já foi apontado pelo campo.
    if (documento?.length !== 11 && documento?.length !== 14) return;
    const cpf = documento.length === 11;
    if (!(cpf ? cpfValido(documento) : cnpjValido(documento))) {
      ctx.addIssue({
        code: 'custom',
        path: ['documento'],
        message: cpf ? 'CPF inválido' : 'CNPJ inválido',
      });
    }
  })
  .transform((dados) => ({
    ...dados,
    chavePix: dados.formaPagamento === 'PIX' ? dados.chavePix : null,
  }));

export type PrestadorFormInput = z.input<typeof prestadorInputSchema>;
export type CreatePrestadorInput = z.output<typeof prestadorInputSchema>;
export type UpdatePrestadorInput = CreatePrestadorInput;
export const createPrestadorSchema = prestadorInputSchema;
export const updatePrestadorSchema = prestadorInputSchema;

/** Colunas ordenáveis do grid: Urgência é `atendeUrgencia` e Avaliação a nota de qualidade. */
export const PRESTADOR_SORT_FIELDS = [
  'nome',
  'categoria',
  'telefone',
  'urgencia',
  'avaliacao',
  'status',
] as const;

/**
 * `GET /api/consultorio-assistencial/prestadores`. Chips Todos/Ativo/Inativo/Bloqueado (`status`),
 * select "Todas categorias" (`categoria`), campo "Buscar prestador..." (`nome`: nome ou nome
 * fantasia) e busca do grid (`search`: nome, fantasia, telefone e CPF/CNPJ). As duas buscas
 * valem juntas (confirmado pelo dev na #40).
 */
export const listPrestadoresQuerySchema = listQuerySchema({
  sortFields: PRESTADOR_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    status: prestadorStatusSchema.optional(),
    categoria: prestadorCategoriaSchema.optional(),
    nome: z
      .string()
      .trim()
      .max(SEARCH_MAX_LENGTH)
      .optional()
      .transform((valor) => valor || undefined),
  },
});

export type ListPrestadoresQuery = z.infer<typeof listPrestadoresQuerySchema>;

export const PRESTADOR_EXPORT_COLUMNS = [
  'nome',
  'categoria',
  'telefone',
  'urgencia',
  'avaliacao',
  'status',
] as const;
export type PrestadorExportColumn = (typeof PRESTADOR_EXPORT_COLUMNS)[number];

/** `GET /api/consultorio-assistencial/prestadores/export`. */
export const exportPrestadoresQuerySchema = exportQuerySchema(
  listPrestadoresQuerySchema,
  PRESTADOR_EXPORT_COLUMNS,
);

export type ExportPrestadoresQuery = z.infer<typeof exportPrestadoresQuerySchema>;

const texto = z.string().nullable();

export const prestadorSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  nomeFantasia: texto,
  tipoPessoa: prestadorTipoPessoaSchema,
  /** CPF ou CNPJ, somente dígitos. */
  documento: texto,
  telefone: texto,
  email: texto,
  status: prestadorStatusSchema,
  endereco: texto,
  categoria: prestadorCategoriaSchema,
  descricaoServico: texto,
  atendeUrgencia: z.boolean(),
  atendeFimSemana: z.boolean(),
  formaPagamento: prestadorFormaPagamentoSchema,
  chavePix: texto,
  valorHora: z.number().nullable(),
  valorDiaria: z.number().nullable(),
  emiteNotaFiscal: z.boolean(),
  notaQualidade: z.number().int(),
  notaPontualidade: z.number().int(),
  avaliacaoPreco: prestadorAvaliacaoPrecoSchema,
  observacoes: texto,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Prestador = z.infer<typeof prestadorSchema>;

export const prestadorPageSchema = paginatedResponseSchema(prestadorSchema);

export type PrestadorPage = z.infer<typeof prestadorPageSchema>;
