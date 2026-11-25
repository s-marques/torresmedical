import { z } from 'zod';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { modeloRespostasSchema } from './modelo-prontuario';

/**
 * Exames, anexos, documentos emitidos, assinatura e versões do atendimento (issue #151).
 * Rotas em `/api/consultorio-assistencial/prontuarios/:pacienteId/atendimentos/:atendimentoId/...`.
 */

const TEXTO_MAX = 4000;
const DESCRICAO_MAX = 500;

const dataObrigatoria = (rotulo: string) => z.iso.date({ error: erroObrigatorio(rotulo, 'f') });

const descricaoOpcional = z
  .string({ error: 'Descrição inválida' })
  .trim()
  .max(DESCRICAO_MAX, { error: `Descrição deve ter no máximo ${DESCRICAO_MAX} caracteres` })
  .nullish()
  .transform((valor) => valor || null);

// --- Anexos e exames ---------------------------------------------------------------------------

export const ATENDIMENTO_ANEXO_TIPOS = ['EXAME', 'ANEXO'] as const;
export const atendimentoAnexoTipoSchema = z.enum(ATENDIMENTO_ANEXO_TIPOS, {
  error: 'Tipo inválido',
});
export type AtendimentoAnexoTipo = z.infer<typeof atendimentoAnexoTipoSchema>;

export const ATENDIMENTO_ANEXO_TIPO_ROTULOS: Record<AtendimentoAnexoTipo, string> = {
  EXAME: 'Exame',
  ANEXO: 'Anexo',
};

/** Corpo de `POST .../atendimentos/:atendimentoId/anexos` (o arquivo já foi enviado em `/api/arquivos`). */
export const atendimentoAnexoInputSchema = z.strictObject({
  tipo: atendimentoAnexoTipoSchema,
  arquivoId: z.uuid({ error: 'Envie o arquivo.' }),
  data: dataObrigatoria('Data'),
  descricao: descricaoOpcional,
});

export type AtendimentoAnexoFormulario = z.input<typeof atendimentoAnexoInputSchema>;
export type CreateAtendimentoAnexoInput = z.output<typeof atendimentoAnexoInputSchema>;

export const atendimentoAnexoSchema = z.object({
  id: z.uuid(),
  atendimentoId: z.uuid(),
  tipo: atendimentoAnexoTipoSchema,
  arquivoId: z.uuid(),
  arquivoNome: z.string().nullable(),
  data: z.iso.date(),
  descricao: z.string().nullable(),
  criadoPorNome: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type AtendimentoAnexo = z.infer<typeof atendimentoAnexoSchema>;

export const atendimentoAnexoListaSchema = z.object({ data: z.array(atendimentoAnexoSchema) });
export type AtendimentoAnexoLista = z.infer<typeof atendimentoAnexoListaSchema>;

// --- Documentos emitidos -----------------------------------------------------------------------

export const ATENDIMENTO_DOCUMENTO_TIPOS = ['ATESTADO', 'DECLARACAO', 'SOLICITACAO_EXAME'] as const;
export const atendimentoDocumentoTipoSchema = z.enum(ATENDIMENTO_DOCUMENTO_TIPOS, {
  error: 'Tipo inválido',
});
export type AtendimentoDocumentoTipo = z.infer<typeof atendimentoDocumentoTipoSchema>;

export const ATENDIMENTO_DOCUMENTO_TIPO_ROTULOS: Record<AtendimentoDocumentoTipo, string> = {
  ATESTADO: 'Atestado',
  DECLARACAO: 'Declaração',
  SOLICITACAO_EXAME: 'Solicitação de exame',
};

/** Corpo de `POST .../atendimentos/:atendimentoId/documentos`. */
export const atendimentoDocumentoInputSchema = z.strictObject({
  tipo: atendimentoDocumentoTipoSchema,
  texto: textoObrigatorio('Texto', { max: TEXTO_MAX }),
  dataEmissao: dataObrigatoria('Data de emissão'),
});

export type AtendimentoDocumentoFormulario = z.input<typeof atendimentoDocumentoInputSchema>;
export type CreateAtendimentoDocumentoInput = z.output<typeof atendimentoDocumentoInputSchema>;

export const atendimentoDocumentoSchema = z.object({
  id: z.uuid(),
  atendimentoId: z.uuid(),
  tipo: atendimentoDocumentoTipoSchema,
  texto: z.string(),
  dataEmissao: z.iso.date(),
  criadoPorNome: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type AtendimentoDocumento = z.infer<typeof atendimentoDocumentoSchema>;

export const atendimentoDocumentoListaSchema = z.object({
  data: z.array(atendimentoDocumentoSchema),
});
export type AtendimentoDocumentoLista = z.infer<typeof atendimentoDocumentoListaSchema>;

// --- Edição do atendimento (só enquanto não assinado) ------------------------------------------

const textoClinico = (rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(TEXTO_MAX, { error: `${rotulo} deve ter no máximo ${TEXTO_MAX} caracteres` })
    .nullable()
    .transform((valor) => valor || null)
    .optional();

/** Corpo de `PATCH .../atendimentos/:atendimentoId`: só os campos enviados mudam. */
export const atendimentoAtualizacaoSchema = z.strictObject({
  tipo: z
    .enum(['CONSULTA', 'RETORNO', 'PROCEDIMENTO', 'EXAME'], { error: 'Tipo inválido' })
    .nullable()
    .optional(),
  queixa: textoClinico('Queixa'),
  evolucao: textoClinico('Evolução'),
  diagnostico: textoClinico('Diagnóstico'),
  conduta: textoClinico('Conduta'),
  observacoes: textoClinico('Observações'),
  /** Respostas do modelo de prontuário (issue #152); substitui as respostas anteriores. */
  respostas: modeloRespostasSchema.optional(),
});

export type AtendimentoAtualizacaoFormulario = z.input<typeof atendimentoAtualizacaoSchema>;
export type UpdateAtendimentoInput = z.output<typeof atendimentoAtualizacaoSchema>;

// --- Assinatura e adendos ----------------------------------------------------------------------

/**
 * Corpo de `POST .../atendimentos/:atendimentoId/assinatura`: a confirmação é a senha do usuário
 * logado, que precisa ser o profissional responsável (decisão do dev: sem certificado ICP-Brasil).
 */
export const assinaturaInputSchema = z.strictObject({
  senha: z
    .string({ error: () => 'Informe a senha para assinar.' })
    .min(1, { error: () => 'Informe a senha para assinar.' }),
});

export type AssinaturaFormulario = z.input<typeof assinaturaInputSchema>;
export type AssinaturaInput = z.output<typeof assinaturaInputSchema>;

/** Corpo de `POST .../atendimentos/:atendimentoId/adendos` (correção de registro assinado). */
export const adendoInputSchema = z.strictObject({
  texto: textoObrigatorio('Adendo', { max: TEXTO_MAX }),
});

export type AdendoFormulario = z.input<typeof adendoInputSchema>;
export type CreateAdendoInput = z.output<typeof adendoInputSchema>;

// --- Histórico de versões ----------------------------------------------------------------------

export const ATENDIMENTO_VERSAO_TIPOS = ['ASSINATURA', 'ADENDO'] as const;
export const atendimentoVersaoTipoSchema = z.enum(ATENDIMENTO_VERSAO_TIPOS);
export type AtendimentoVersaoTipo = z.infer<typeof atendimentoVersaoTipoSchema>;

export const ATENDIMENTO_VERSAO_TIPO_ROTULOS: Record<AtendimentoVersaoTipo, string> = {
  ASSINATURA: 'Assinatura',
  ADENDO: 'Adendo',
};

/** Conteúdo clínico do atendimento num instante (antes ou depois), com os adendos até ali. */
export const atendimentoSnapshotSchema = z.object({
  tipo: z.string().nullable(),
  queixa: z.string().nullable(),
  evolucao: z.string().nullable(),
  diagnostico: z.string().nullable(),
  conduta: z.string().nullable(),
  observacoes: z.string().nullable(),
  /** Respostas do modelo (issue #152); ausente nos registros anteriores a ele. */
  respostas: modeloRespostasSchema.nullish(),
  adendos: z.array(z.string()),
});

export type AtendimentoSnapshot = z.infer<typeof atendimentoSnapshotSchema>;

export const atendimentoVersaoSchema = z.object({
  id: z.uuid(),
  atendimentoId: z.uuid(),
  /** 1 = assinatura; 2 em diante = adendos. */
  numero: z.number().int().min(1),
  tipo: atendimentoVersaoTipoSchema,
  usuarioId: z.string(),
  usuarioNome: z.string().nullable(),
  /** Texto do adendo (`null` na assinatura). */
  texto: z.string().nullable(),
  antes: atendimentoSnapshotSchema.nullable(),
  depois: atendimentoSnapshotSchema,
  /** SHA-256 do conteúdo depois da versão: prova que o registro não foi alterado. */
  hash: z.string(),
  createdAt: z.iso.datetime(),
});

export type AtendimentoVersao = z.infer<typeof atendimentoVersaoSchema>;

export const atendimentoVersaoListaSchema = z.object({ data: z.array(atendimentoVersaoSchema) });
export type AtendimentoVersaoLista = z.infer<typeof atendimentoVersaoListaSchema>;
