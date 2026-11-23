import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import { periodoNpsSchema, NPS_COMENTARIO_MAX, NPS_NOTA_MAX, NPS_NOTA_MIN } from './pesquisa-nps';

/**
 * Pesquisa de experiência do profissional (issue #145; requisito do cliente R §36 e §27 item 9):
 * o profissional que usa o Torres avalia Estrutura, Recepção, Agenda e Atendimento (1 a 5
 * estrelas), dá a nota NPS (0 a 10) e pode comentar. A primeira pesquisa sai aos 30 dias do início
 * do contrato; as seguintes, na periodicidade configurada. A resposta vem por um link com token
 * (página pública), mandado pelo WhatsApp.
 */

/** Dias do início do contrato até a primeira pesquisa. */
export const PESQUISA_PROFISSIONAL_DIAS_PRIMEIRA = 30;

export const PESQUISA_PROFISSIONAL_PERIODICIDADE_PADRAO_MESES = 6;
export const PESQUISA_PROFISSIONAL_PERIODICIDADE_MAX_MESES = 24;

/** Validade do link de resposta. */
export const PESQUISA_PROFISSIONAL_VALIDADE_DIAS = 30;

export const ESTRELAS_MIN = 1;
export const ESTRELAS_MAX = 5;

export const PESQUISA_PROFISSIONAL_CATEGORIAS = [
  'ESTRUTURA',
  'RECEPCAO',
  'AGENDA',
  'ATENDIMENTO',
] as const;
export type PesquisaProfissionalCategoria = (typeof PESQUISA_PROFISSIONAL_CATEGORIAS)[number];
export const PESQUISA_PROFISSIONAL_CATEGORIA_ROTULO: Readonly<
  Record<PesquisaProfissionalCategoria, string>
> = {
  ESTRUTURA: 'Estrutura',
  RECEPCAO: 'Recepção',
  AGENDA: 'Agenda',
  ATENDIMENTO: 'Atendimento',
};

export const PESQUISA_PROFISSIONAL_STATUS = ['ENVIADA', 'RESPONDIDA', 'FALHA'] as const;
export type PesquisaProfissionalStatus = (typeof PESQUISA_PROFISSIONAL_STATUS)[number];
export const PESQUISA_PROFISSIONAL_STATUS_ROTULO: Readonly<
  Record<PesquisaProfissionalStatus, string>
> = {
  ENVIADA: 'Aguardando resposta',
  RESPONDIDA: 'Respondida',
  FALHA: 'Falha no envio',
};

/** Pesquisa dos 30 dias (`ciclo` 0) ou periódica (`ciclo` 1 em diante). */
export const PESQUISA_PROFISSIONAL_TIPOS = ['TRINTA_DIAS', 'PERIODICA'] as const;
export type PesquisaProfissionalTipo = (typeof PESQUISA_PROFISSIONAL_TIPOS)[number];
export const PESQUISA_PROFISSIONAL_TIPO_ROTULO: Readonly<Record<PesquisaProfissionalTipo, string>> =
  {
    TRINTA_DIAS: '30 dias',
    PERIODICA: 'Periódica',
  };

/** Texto enviado ao profissional (variáveis `{nome}` e `{link}`). */
export const PESQUISA_PROFISSIONAL_MENSAGEM_PADRAO =
  'Olá {nome}! Queremos saber como está sendo sua experiência no Torres Medical. Leva menos de 2 minutos: {link}';

export function aplicarVariaveisPesquisaProfissional(
  texto: string,
  dados: { nome: string; link: string },
): string {
  return texto.replaceAll('{nome}', dados.nome).replaceAll('{link}', dados.link);
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Data inválida' });
const contagem = z.number().int().nonnegative();

// ---------- Configuração ----------

export const pesquisaProfissionalConfigInputSchema = z.strictObject({
  ativo: z.boolean({ error: erroObrigatorio('Ativo') }),
  periodicidadeMeses: z
    .number({ error: erroObrigatorio('Periodicidade', 'f') })
    .int({ error: 'A periodicidade deve ser um número inteiro' })
    .min(1, { error: 'A periodicidade deve ser de no mínimo 1 mês' })
    .max(PESQUISA_PROFISSIONAL_PERIODICIDADE_MAX_MESES, {
      error: `A periodicidade deve ser de no máximo ${PESQUISA_PROFISSIONAL_PERIODICIDADE_MAX_MESES} meses`,
    }),
  mensagem: z
    .string({ error: erroObrigatorio('Mensagem', 'f') })
    .trim()
    .min(1, { error: erroObrigatorio('Mensagem', 'f') })
    .max(1000, { error: 'A mensagem deve ter até 1000 caracteres' })
    .refine((texto) => texto.includes('{link}'), {
      error: 'A mensagem deve conter a variável {link}',
    }),
});
export type PesquisaProfissionalConfigInput = z.infer<typeof pesquisaProfissionalConfigInputSchema>;

export const pesquisaProfissionalConfigSchema = pesquisaProfissionalConfigInputSchema.extend({
  atualizadoEm: z.iso.datetime().nullable(),
});
export type PesquisaProfissionalConfig = z.infer<typeof pesquisaProfissionalConfigSchema>;

export const PESQUISA_PROFISSIONAL_CONFIG_PADRAO: PesquisaProfissionalConfigInput = {
  ativo: true,
  periodicidadeMeses: PESQUISA_PROFISSIONAL_PERIODICIDADE_PADRAO_MESES,
  mensagem: PESQUISA_PROFISSIONAL_MENSAGEM_PADRAO,
};

// ---------- Painel (Dashboard) ----------

export const resumoPesquisaProfissionalQuerySchema = periodoNpsSchema.extend({
  profissionalId: z.uuid().optional(),
});
export type ResumoPesquisaProfissionalQuery = z.infer<typeof resumoPesquisaProfissionalQuerySchema>;

export const mediaCategoriaSchema = z.object({
  categoria: z.enum(PESQUISA_PROFISSIONAL_CATEGORIAS),
  /** Média das estrelas (1 a 5) com uma casa decimal; 0 sem avaliações. */
  media: z.number().min(0).max(ESTRELAS_MAX),
  avaliacoes: contagem,
});
export type MediaCategoria = z.infer<typeof mediaCategoriaSchema>;

export const resumoPesquisaProfissionalSchema = z.object({
  /** Período efetivamente usado (com os padrões aplicados). */
  de: dia,
  ate: dia,
  /** NPS dos profissionais: % promotores − % detratores. */
  score: z.number().int().min(-100).max(100),
  enviadas: contagem,
  respondidas: contagem,
  taxaResposta: z.number().int().min(0).max(100),
  avaliacoes: contagem,
  promotores: contagem,
  neutros: contagem,
  detratores: contagem,
  categorias: z.array(mediaCategoriaSchema),
});
export type ResumoPesquisaProfissional = z.infer<typeof resumoPesquisaProfissionalSchema>;

/** NPS dos médicos de um mês, para o relatório mensal (R §27 item 9). */
export const npsProfissionaisMesSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  score: z.number().int().min(-100).max(100),
  avaliacoes: contagem,
});
export type NpsProfissionaisMes = z.infer<typeof npsProfissionaisMesSchema>;

// ---------- Respostas (lista) ----------

export const pesquisaProfissionalSchema = z.object({
  id: z.uuid(),
  profissionalId: z.uuid(),
  profissional: z.string(),
  tipo: z.enum(PESQUISA_PROFISSIONAL_TIPOS),
  status: z.enum(PESQUISA_PROFISSIONAL_STATUS),
  notaEstrutura: z.number().int().nullable(),
  notaRecepcao: z.number().int().nullable(),
  notaAgenda: z.number().int().nullable(),
  notaAtendimento: z.number().int().nullable(),
  nps: z.number().int().min(NPS_NOTA_MIN).max(NPS_NOTA_MAX).nullable(),
  comentario: z.string().nullable(),
  enviadaEm: z.iso.datetime(),
  respondidaEm: z.iso.datetime().nullable(),
});
export type PesquisaProfissional = z.infer<typeof pesquisaProfissionalSchema>;

export const pesquisaProfissionalPageSchema = paginatedResponseSchema(pesquisaProfissionalSchema);
export type PesquisaProfissionalPage = z.infer<typeof pesquisaProfissionalPageSchema>;

export const PESQUISA_PROFISSIONAL_SORT_FIELDS = [
  'enviadaEm',
  'respondidaEm',
  'profissional',
  'nps',
] as const;

/** `GET /pesquisa-profissional`: período, profissional, status e busca pelo nome. */
export const listPesquisasProfissionalQuerySchema = listQuerySchema({
  sortFields: PESQUISA_PROFISSIONAL_SORT_FIELDS,
  defaultSort: 'enviadaEm:desc',
  filters: {
    de: dia.optional(),
    ate: dia.optional(),
    profissionalId: z.uuid().optional(),
    status: z.enum(PESQUISA_PROFISSIONAL_STATUS).optional(),
  },
});
export type ListPesquisasProfissionalQuery = z.infer<typeof listPesquisasProfissionalQuerySchema>;

// ---------- Página pública de resposta (link com token) ----------

export const pesquisaProfissionalPublicaSchema = z.object({
  profissional: z.string(),
  /** `false` quando já foi respondida ou o link expirou. */
  aberta: z.boolean(),
  motivo: z.enum(['RESPONDIDA', 'EXPIRADA']).nullable(),
});
export type PesquisaProfissionalPublica = z.infer<typeof pesquisaProfissionalPublicaSchema>;

const estrelas = (rotulo: string) =>
  z
    .number({ error: erroObrigatorio(rotulo, 'f') })
    .int({ error: 'A nota deve ser um número inteiro' })
    .min(ESTRELAS_MIN, { error: `A nota deve estar entre ${ESTRELAS_MIN} e ${ESTRELAS_MAX}` })
    .max(ESTRELAS_MAX, { error: `A nota deve estar entre ${ESTRELAS_MIN} e ${ESTRELAS_MAX}` });

export const respostaPesquisaProfissionalInputSchema = z.strictObject({
  notaEstrutura: estrelas('Nota de Estrutura'),
  notaRecepcao: estrelas('Nota de Recepção'),
  notaAgenda: estrelas('Nota de Agenda'),
  notaAtendimento: estrelas('Nota de Atendimento'),
  nps: z
    .number({ error: erroObrigatorio('Nota NPS', 'f') })
    .int({ error: 'A nota deve ser um número inteiro' })
    .min(NPS_NOTA_MIN, { error: 'A nota deve estar entre 0 e 10' })
    .max(NPS_NOTA_MAX, { error: 'A nota deve estar entre 0 e 10' }),
  comentario: z
    .string()
    .trim()
    .max(NPS_COMENTARIO_MAX, {
      error: `O comentário deve ter até ${NPS_COMENTARIO_MAX} caracteres`,
    })
    .optional()
    .transform((v) => v || undefined),
});
export type RespostaPesquisaProfissionalInput = z.output<
  typeof respostaPesquisaProfissionalInputSchema
>;
