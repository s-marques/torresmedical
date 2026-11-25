import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { listQuerySchema } from '../common/list-query';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Modelos de prontuário por profissão e especialidade (issue #152). O modelo tem seções e campos
 * (texto, número, lista, data e escala). Cada alteração das seções cria uma nova versão; o
 * atendimento guarda a versão usada e as respostas, então mudar o modelo não altera o que já foi
 * registrado. Rotas em `/api/consultorio-assistencial/modelos-prontuario`.
 */

export const MODELO_NOME_MAX = 120;
export const MODELO_ESPECIALIDADE_MAX = 100;
export const MODELO_ROTULO_MAX = 120;
export const MODELO_OPCAO_MAX = 80;
export const MODELO_MAX_SECOES = 20;
export const MODELO_MAX_CAMPOS_POR_SECAO = 50;
export const MODELO_MAX_OPCOES = 30;
export const MODELO_TEXTO_RESPOSTA_MAX = 4000;
export const MODELO_ESCALA_MIN_PADRAO = 0;
export const MODELO_ESCALA_MAX_PADRAO = 10;
export const MODELO_NUMERO_LIMITE = 1_000_000_000;

// --- Profissão e tipos de campo ------------------------------------------------------------------

/** Profissões citadas pelo cliente (R §38); "Outra" cobre as demais. */
export const MODELO_PROFISSOES = [
  'MEDICO',
  'PSICOLOGO',
  'NUTRICIONISTA',
  'FISIOTERAPEUTA',
  'BIOMEDICO',
  'OUTRA',
] as const;
export const modeloProfissaoSchema = z.enum(MODELO_PROFISSOES, { error: 'Profissão inválida' });
export type ModeloProfissao = z.infer<typeof modeloProfissaoSchema>;

export const MODELO_PROFISSAO_ROTULOS: Readonly<Record<ModeloProfissao, string>> = {
  MEDICO: 'Médico',
  PSICOLOGO: 'Psicólogo',
  NUTRICIONISTA: 'Nutricionista',
  FISIOTERAPEUTA: 'Fisioterapeuta',
  BIOMEDICO: 'Biomédico',
  OUTRA: 'Outra',
};

export const MODELO_CAMPO_TIPOS = ['TEXTO', 'NUMERO', 'LISTA', 'DATA', 'ESCALA'] as const;
export const modeloCampoTipoSchema = z.enum(MODELO_CAMPO_TIPOS, { error: 'Tipo inválido' });
export type ModeloCampoTipo = z.infer<typeof modeloCampoTipoSchema>;

export const MODELO_CAMPO_TIPO_ROTULOS: Readonly<Record<ModeloCampoTipo, string>> = {
  TEXTO: 'Texto',
  NUMERO: 'Número',
  LISTA: 'Lista',
  DATA: 'Data',
  ESCALA: 'Escala',
};

// --- Campos e seções -----------------------------------------------------------------------------

const CHAVE_REGEX = /^[a-z][a-z0-9_]{0,39}$/;

type Falha = (
  caminho: (string | number)[],
  chave: string,
  params?: Record<string, string | number>,
) => void;

/** Regras que dependem do tipo: lista precisa de opções; número e escala, de uma faixa coerente. */
function validarCampo(
  campo: { tipo: ModeloCampoTipo; opcoes: string[] | null; min: number | null; max: number | null },
  falhar: Falha,
): void {
  if (campo.tipo === 'LISTA') {
    const opcoes = campo.opcoes ?? [];
    if (opcoes.length < 2) falhar(['opcoes'], 'validacao.modelo.listaMinOpcoes');
    else if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) {
      falhar(['opcoes'], 'validacao.modelo.opcaoDuplicada');
    }
  }
  if (campo.min !== null && campo.max !== null && campo.min >= campo.max) {
    falhar(['max'], 'validacao.modelo.faixaInvalida');
  }
}

const numeroLimitado = z
  .number({ error: () => traduzirValidacao('validacao.valorInvalido') })
  .min(-MODELO_NUMERO_LIMITE)
  .max(MODELO_NUMERO_LIMITE);

export const modeloCampoSchema = z
  .strictObject({
    /** Identificador estável do campo dentro do modelo: é a chave das respostas. */
    chave: z
      .string({ error: erroObrigatorio('Chave') })
      .regex(CHAVE_REGEX, { error: () => traduzirValidacao('validacao.modelo.chaveInvalida') }),
    rotulo: textoObrigatorio('Rótulo', { max: MODELO_ROTULO_MAX }),
    tipo: modeloCampoTipoSchema,
    obrigatorio: z.boolean().default(false),
    /** Opções do tipo Lista. */
    opcoes: z
      .array(textoObrigatorio('Opção', { max: MODELO_OPCAO_MAX }))
      .max(MODELO_MAX_OPCOES)
      .nullish()
      .transform((valor) => valor ?? null),
    /** Faixa do tipo Número (opcional) e Escala (padrão 0 a 10). */
    min: numeroLimitado.nullish().transform((valor) => valor ?? null),
    max: numeroLimitado.nullish().transform((valor) => valor ?? null),
  })
  .transform((campo) => {
    if (campo.tipo === 'LISTA') return { ...campo, min: null, max: null };
    if (campo.tipo === 'ESCALA') {
      return {
        ...campo,
        opcoes: null,
        min: campo.min === null ? MODELO_ESCALA_MIN_PADRAO : Math.trunc(campo.min),
        max: campo.max === null ? MODELO_ESCALA_MAX_PADRAO : Math.trunc(campo.max),
      };
    }
    if (campo.tipo === 'NUMERO') return { ...campo, opcoes: null };
    return { ...campo, opcoes: null, min: null, max: null };
  })
  .superRefine((campo, ctx) => {
    validarCampo(campo, (path, chave, params) =>
      ctx.addIssue({ code: 'custom', path, message: traduzirValidacao(chave, params) }),
    );
  });

export type ModeloCampoFormulario = z.input<typeof modeloCampoSchema>;
export type ModeloCampo = z.output<typeof modeloCampoSchema>;

export const modeloSecaoSchema = z.strictObject({
  titulo: textoObrigatorio('Título da seção', { max: MODELO_ROTULO_MAX }),
  campos: z
    .array(modeloCampoSchema, { error: erroObrigatorio('Campos') })
    .min(1, { error: () => traduzirValidacao('validacao.modelo.secaoSemCampos') })
    .max(MODELO_MAX_CAMPOS_POR_SECAO),
});

export type ModeloSecaoFormulario = z.input<typeof modeloSecaoSchema>;
export type ModeloSecao = z.output<typeof modeloSecaoSchema>;

/** Seções do modelo: ao menos uma e sem chave de campo repetida (as respostas usam a chave). */
export const modeloSecoesSchema = z
  .array(modeloSecaoSchema, { error: erroObrigatorio('Seções', 'f') })
  .min(1, { error: () => traduzirValidacao('validacao.modelo.semSecoes') })
  .max(MODELO_MAX_SECOES)
  .superRefine((secoes, ctx) => {
    const vistas = new Set<string>();
    secoes.forEach((secao, i) =>
      secao.campos.forEach((campo, j) => {
        if (vistas.has(campo.chave)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'campos', j, 'chave'],
            message: traduzirValidacao('validacao.modelo.chaveDuplicada'),
          });
        }
        vistas.add(campo.chave);
      }),
    );
  });

export type ModeloSecoesFormulario = z.input<typeof modeloSecoesSchema>;
export type ModeloSecoes = z.output<typeof modeloSecoesSchema>;

// --- Modelo (cadastro) ---------------------------------------------------------------------------

const especialidadeOpcional = z
  .string({ error: 'Especialidade inválida' })
  .trim()
  .max(MODELO_ESPECIALIDADE_MAX, {
    error: () =>
      traduzirValidacao('validacao.campoMax', {
        campo: 'Especialidade',
        count: MODELO_ESPECIALIDADE_MAX,
      }),
  })
  .nullish()
  .transform((valor) => valor || null);

const baseModelo = {
  nome: textoObrigatorio('Nome', { max: MODELO_NOME_MAX }),
  profissao: modeloProfissaoSchema,
  especialidade: especialidadeOpcional,
  secoes: modeloSecoesSchema,
};

/** Corpo de `POST .../modelos-prontuario/padrao`: modelo da clínica (gerência). */
export const modeloPadraoInputSchema = z.strictObject({
  ...baseModelo,
  ativo: z.boolean().optional(),
});
export type ModeloPadraoFormulario = z.input<typeof modeloPadraoInputSchema>;
export type CreateModeloPadraoInput = z.output<typeof modeloPadraoInputSchema>;

/** Corpo de `POST .../modelos-prontuario`: modelo do próprio profissional. */
export const modeloProprioInputSchema = z.strictObject({
  ...baseModelo,
  profissionalId: z.uuid({ error: 'Selecione o profissional.' }),
  ativo: z.boolean().optional(),
});
export type ModeloProprioFormulario = z.input<typeof modeloProprioInputSchema>;
export type CreateModeloProprioInput = z.output<typeof modeloProprioInputSchema>;

/**
 * Corpo de `PATCH` (do modelo próprio ou do padrão): só o que for enviado muda. Enviar `secoes`
 * cria uma nova versão; os atendimentos já registrados continuam na versão antiga.
 */
export const modeloAtualizacaoSchema = z.strictObject({
  nome: baseModelo.nome.optional(),
  profissao: modeloProfissaoSchema.optional(),
  especialidade: especialidadeOpcional.optional(),
  secoes: modeloSecoesSchema.optional(),
  ativo: z.boolean().optional(),
});
export type ModeloAtualizacaoFormulario = z.input<typeof modeloAtualizacaoSchema>;
export type UpdateModeloInput = z.output<typeof modeloAtualizacaoSchema>;

export const modeloProntuarioSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  profissao: modeloProfissaoSchema,
  especialidade: z.string().nullable(),
  /** `null` = modelo padrão da clínica. */
  profissionalId: z.uuid().nullable(),
  profissionalNome: z.string().nullable(),
  padrao: z.boolean(),
  ativo: z.boolean(),
  /** Número da versão atual das seções. */
  versao: z.number().int().min(1),
  secoes: modeloSecoesSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ModeloProntuario = z.infer<typeof modeloProntuarioSchema>;

export const MODELO_SORT_FIELDS = ['nome', 'profissao', 'updatedAt'] as const;
export const MODELO_ESCOPOS = ['PADRAO', 'PROPRIO'] as const;

/**
 * `GET .../modelos-prontuario`: `profissionalId` traz os modelos usáveis por aquele profissional
 * (os padrão e os dele); `somenteAtivos` serve ao seletor do atendimento.
 */
export const listModelosQuerySchema = listQuerySchema({
  sortFields: MODELO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    profissao: modeloProfissaoSchema.optional(),
    tipo: z.enum(MODELO_ESCOPOS).optional(),
    profissionalId: z.uuid().optional(),
    somenteAtivos: z
      .enum(['true', 'false'])
      .optional()
      .transform((valor) => valor === 'true'),
  },
});
export type ListModelosQuery = z.infer<typeof listModelosQuerySchema>;

export const modeloProntuarioPageSchema = paginatedResponseSchema(modeloProntuarioSchema);
export type ModeloProntuarioPage = z.infer<typeof modeloProntuarioPageSchema>;

// --- Respostas no atendimento --------------------------------------------------------------------

export const modeloRespostaValorSchema = z.union([
  z.string().max(MODELO_TEXTO_RESPOSTA_MAX),
  z.number(),
  z.null(),
]);
export type ModeloRespostaValor = z.infer<typeof modeloRespostaValorSchema>;

/** Respostas do atendimento: chave do campo → valor. */
export const modeloRespostasSchema = z.record(
  z.string().regex(CHAVE_REGEX),
  modeloRespostaValorSchema,
);
export type ModeloRespostas = z.infer<typeof modeloRespostasSchema>;

/** Versão do modelo usada pelo atendimento (cópia fiel das seções naquele momento). */
export const atendimentoModeloSchema = z.object({
  modeloId: z.uuid(),
  versaoId: z.uuid(),
  nome: z.string(),
  versao: z.number().int().min(1),
  secoes: modeloSecoesSchema,
});
export type AtendimentoModelo = z.infer<typeof atendimentoModeloSchema>;

export interface ErroResposta {
  /** Chave do campo (vira `respostas.<chave>` no formulário). */
  chave: string;
  mensagem: string;
}

const vazio = (valor: ModeloRespostaValor | undefined): boolean =>
  valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');

function erroDoValor(campo: ModeloCampo, valor: ModeloRespostaValor): string | null {
  switch (campo.tipo) {
    case 'TEXTO':
      return typeof valor === 'string' ? null : traduzirValidacao('validacao.valorInvalido');
    case 'DATA':
      return typeof valor === 'string' && z.iso.date().safeParse(valor).success
        ? null
        : traduzirValidacao('validacao.formato.date');
    case 'LISTA':
      return typeof valor === 'string' && (campo.opcoes ?? []).includes(valor)
        ? null
        : traduzirValidacao('validacao.opcaoInvalida');
    case 'NUMERO':
    case 'ESCALA': {
      const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
      if (typeof numero !== 'number' || !Number.isFinite(numero)) {
        return traduzirValidacao('validacao.valorInvalido');
      }
      if (campo.tipo === 'ESCALA' && !Number.isInteger(numero)) {
        return traduzirValidacao('validacao.valorInvalido');
      }
      if (campo.min !== null && numero < campo.min) {
        return traduzirValidacao('validacao.maiorOuIgual', { valor: campo.min });
      }
      if (campo.max !== null && numero > campo.max) {
        return traduzirValidacao('validacao.menorOuIgual', { valor: campo.max });
      }
      return null;
    }
  }
}

/**
 * Confere as respostas com as seções da versão do modelo: campo obrigatório preenchido, valor do
 * tipo certo e chave existente. Com `exigirObrigatorios: false` (atendimento em andamento) só o
 * tipo e a chave são conferidos; os obrigatórios valem ao assinar. Usada no front (formulário) e no back (a regra é sempre do back).
 */
export function validarRespostas(
  secoes: readonly ModeloSecao[],
  respostas: Readonly<Record<string, ModeloRespostaValor>>,
  { exigirObrigatorios = true }: { exigirObrigatorios?: boolean } = {},
): ErroResposta[] {
  const erros: ErroResposta[] = [];
  const campos = new Map(secoes.flatMap((s) => s.campos.map((c) => [c.chave, c] as const)));
  for (const chave of Object.keys(respostas)) {
    if (!campos.has(chave)) {
      erros.push({ chave, mensagem: traduzirValidacao('validacao.campoNaoPermitido') });
    }
  }
  for (const [chave, campo] of campos) {
    const valor = respostas[chave];
    if (vazio(valor)) {
      if (campo.obrigatorio && exigirObrigatorios) {
        erros.push({
          chave,
          mensagem: traduzirValidacao('validacao.obrigatorio', { campo: campo.rotulo }),
        });
      }
      continue;
    }
    const mensagem = erroDoValor(campo, valor as ModeloRespostaValor);
    if (mensagem) erros.push({ chave, mensagem });
  }
  return erros;
}

/** Normaliza o valor digitado: texto vazio vira `null` e número em texto vira número. */
export function normalizarRespostas(
  secoes: readonly ModeloSecao[],
  respostas: Readonly<Record<string, ModeloRespostaValor>>,
): ModeloRespostas {
  const tipos = new Map(secoes.flatMap((s) => s.campos.map((c) => [c.chave, c.tipo] as const)));
  const saida: ModeloRespostas = {};
  for (const [chave, valor] of Object.entries(respostas)) {
    if (vazio(valor)) {
      saida[chave] = null;
      continue;
    }
    const tipo = tipos.get(chave);
    const numerico = tipo === 'NUMERO' || tipo === 'ESCALA';
    saida[chave] = numerico && typeof valor === 'string' ? Number(valor) : valor;
  }
  return saida;
}
