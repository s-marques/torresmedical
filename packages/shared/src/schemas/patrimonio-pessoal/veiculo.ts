import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const VEICULO_DESCRICAO_MAX = 200;
export const VEICULO_PLACA_MAX = 20;
export const VEICULO_RENAVAM_MAX = 30;
export const VEICULO_CHASSI_MAX = 30;
export const VEICULO_COR_MAX = 50;
export const VEICULO_BANCO_MAX = 100;
export const VEICULO_OBSERVACOES_MAX = 2000;
export const VEICULO_VALOR_MAX = 9_999_999_999.99;
export const VEICULO_ANO_MIN = 1900;
export const VEICULO_ANO_MAX = 2100;

/** Select "Tipo" do modal (prints do dev na #63; padrão Carro). */
export const VEICULO_TIPOS = ['CARRO', 'MOTO', 'UTILITARIO'] as const;
export const veiculoTipoSchema = z.enum(VEICULO_TIPOS);
export type VeiculoTipo = z.infer<typeof veiculoTipoSchema>;
/** Rótulos em português (exportação Excel/PDF). Na tela, o front traduz por `veiculos.tipos`. */
export const VEICULO_TIPO_ROTULOS: Readonly<Record<VeiculoTipo, string>> = {
  CARRO: 'Carro',
  MOTO: 'Moto',
  UTILITARIO: 'Utilitário',
};

/** Select "Uso" do modal (prints do dev na #63; padrão Clínica). */
export const VEICULO_USOS = ['CLINICA', 'PESSOAL', 'MISTO'] as const;
export const veiculoUsoSchema = z.enum(VEICULO_USOS);
export type VeiculoUso = z.infer<typeof veiculoUsoSchema>;
export const VEICULO_USO_ROTULOS: Readonly<Record<VeiculoUso, string>> = {
  CLINICA: 'Clínica',
  PESSOAL: 'Pessoal',
  MISTO: 'Misto',
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
    .max(VEICULO_VALOR_MAX)
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
 * Corpo de `POST` e `PATCH /api/patrimonio-pessoal/veiculos` (modal "Novo Veiculo", seções Dados
 * do Veículo, Valores e Impostos e Financiamento/Leasing). O `PATCH` substitui todos os campos
 * (o modal Editar envia o formulário inteiro). Só a Descrição é obrigatória.
 */
export const veiculoInputSchema = z.strictObject({
  // Dados do Veículo
  descricao: textoObrigatorio('Descrição', { genero: 'f', max: VEICULO_DESCRICAO_MAX }),
  tipo: veiculoTipoSchema.default('CARRO'),
  placa: textoOpcional(VEICULO_PLACA_MAX, 'Placa'),
  renavam: textoOpcional(VEICULO_RENAVAM_MAX, 'RENAVAM'),
  chassi: textoOpcional(VEICULO_CHASSI_MAX, 'Chassi'),
  ano: z
    .number()
    .int()
    .min(VEICULO_ANO_MIN)
    .max(VEICULO_ANO_MAX)
    .nullish()
    .transform((valor) => valor ?? null),
  cor: textoOpcional(VEICULO_COR_MAX, 'Cor'),
  uso: veiculoUsoSchema.default('CLINICA'),
  // Valores e Impostos
  valorCompra: valorOpcional(),
  dataCompra: dataOpcional(),
  ipvaAnual: valorOpcional(),
  licenciamento: valorOpcional(),
  seguroAnual: valorOpcional(),
  vencimentoSeguro: dataOpcional(),
  // Financiamento/Leasing
  banco: textoOpcional(VEICULO_BANCO_MAX, 'Banco'),
  financiamentoParcela: valorOpcional(),
  saldoDevedor: valorOpcional(),
  vencimentoFinanciamento: dataOpcional(),
  observacoes: textoOpcional(VEICULO_OBSERVACOES_MAX, 'Observações'),
});

export type VeiculoFormInput = z.input<typeof veiculoInputSchema>;
export type CreateVeiculoInput = z.output<typeof veiculoInputSchema>;
export type UpdateVeiculoInput = CreateVeiculoInput;
export const createVeiculoSchema = veiculoInputSchema;
export const updateVeiculoSchema = veiculoInputSchema;

/** Colunas ordenáveis do grid (as sete do inventário). */
export const VEICULO_SORT_FIELDS = [
  'descricao',
  'placa',
  'tipo',
  'uso',
  'ipvaAnual',
  'seguroAnual',
  'financiamentoParcela',
] as const;

/** `GET /api/patrimonio-pessoal/veiculos`: busca "Buscar veiculos..." (`search`) e ordenação. */
export const listVeiculosQuerySchema = listQuerySchema({
  sortFields: VEICULO_SORT_FIELDS,
  defaultSort: 'descricao:asc',
  filters: {},
});

export type ListVeiculosQuery = z.infer<typeof listVeiculosQuerySchema>;

export const VEICULO_EXPORT_COLUMNS = VEICULO_SORT_FIELDS;
export type VeiculoExportColumn = (typeof VEICULO_EXPORT_COLUMNS)[number];

/** `GET /api/patrimonio-pessoal/veiculos/export`. */
export const exportVeiculosQuerySchema = exportQuerySchema(
  listVeiculosQuerySchema,
  VEICULO_EXPORT_COLUMNS,
);

export type ExportVeiculosQuery = z.infer<typeof exportVeiculosQuerySchema>;

const texto = z.string().nullable();
const valor = z.number().nullable();

export const veiculoSchema = z.object({
  id: z.uuid(),
  descricao: z.string(),
  tipo: veiculoTipoSchema,
  placa: texto,
  renavam: texto,
  chassi: texto,
  ano: z.number().int().nullable(),
  cor: texto,
  uso: veiculoUsoSchema,
  valorCompra: valor,
  dataCompra: z.iso.date().nullable(),
  ipvaAnual: valor,
  licenciamento: valor,
  seguroAnual: valor,
  vencimentoSeguro: z.iso.date().nullable(),
  banco: texto,
  financiamentoParcela: valor,
  saldoDevedor: valor,
  vencimentoFinanciamento: z.iso.date().nullable(),
  observacoes: texto,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Veiculo = z.infer<typeof veiculoSchema>;

export const veiculoPageSchema = paginatedResponseSchema(veiculoSchema);

export type VeiculoPage = z.infer<typeof veiculoPageSchema>;
