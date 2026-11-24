import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { erroObrigatorio } from '../common/obrigatorio';

/**
 * Documentos do profissional (issue #141): contrato, documentos pessoais, registro no conselho,
 * RQE, licenças, certificados e documentos sanitários, com validade e validação.
 *
 * Decisões (a confirmar com o dev, ver PR): lista de tipos fechada no código; situação gravada
 * `ENVIADO`/`VALIDADO`/`RECUSADO`; `VENCIDO` e `PENDENTE` são calculadas (nunca gravadas);
 * alertas em 60 e 30 dias, como Alvarás e Licenças.
 */

export const PROFISSIONAL_DOCUMENTO_TIPOS = [
  'CONTRATO',
  'DOCUMENTO_PESSOAL',
  'REGISTRO_CONSELHO',
  'RQE',
  'LICENCA',
  'CERTIFICADO',
  'DOCUMENTO_SANITARIO',
  'OUTRO',
] as const;
export type ProfissionalDocumentoTipo = (typeof PROFISSIONAL_DOCUMENTO_TIPOS)[number];
export const profissionalDocumentoTipoSchema = z.enum(PROFISSIONAL_DOCUMENTO_TIPOS, {
  error: () => traduzirValidacao('validacao.opcaoInvalida'),
});

/** Rótulos em português (API, exportação e logs). A tela usa as traduções. */
export const PROFISSIONAL_DOCUMENTO_TIPO_ROTULOS: Readonly<
  Record<ProfissionalDocumentoTipo, string>
> = {
  CONTRATO: 'Contrato',
  DOCUMENTO_PESSOAL: 'Documento pessoal',
  REGISTRO_CONSELHO: 'Registro no conselho (CRM, CRN…)',
  RQE: 'RQE',
  LICENCA: 'Licença',
  CERTIFICADO: 'Certificado',
  DOCUMENTO_SANITARIO: 'Documento sanitário',
  OUTRO: 'Outro',
};

/** Situação gravada no banco. */
export const PROFISSIONAL_DOCUMENTO_SITUACOES_GRAVADAS = [
  'ENVIADO',
  'VALIDADO',
  'RECUSADO',
] as const;
export type ProfissionalDocumentoSituacaoGravada =
  (typeof PROFISSIONAL_DOCUMENTO_SITUACOES_GRAVADAS)[number];

/** Situação exibida: a gravada, mais `VENCIDO` (validade passada) e `PENDENTE` (obrigatório sem envio). */
export const PROFISSIONAL_DOCUMENTO_SITUACOES = [
  'PENDENTE',
  'ENVIADO',
  'VALIDADO',
  'VENCIDO',
  'RECUSADO',
] as const;
export type ProfissionalDocumentoSituacao = (typeof PROFISSIONAL_DOCUMENTO_SITUACOES)[number];
export const profissionalDocumentoSituacaoSchema = z.enum(PROFISSIONAL_DOCUMENTO_SITUACOES, {
  error: () => traduzirValidacao('validacao.opcaoInvalida'),
});

export const PROFISSIONAL_DOCUMENTO_SITUACAO_ROTULOS: Readonly<
  Record<ProfissionalDocumentoSituacao, string>
> = {
  PENDENTE: 'Pendente',
  ENVIADO: 'Enviado',
  VALIDADO: 'Validado',
  VENCIDO: 'Vencido',
  RECUSADO: 'Recusado',
};

/** Janelas do alerta de vencimento (mesmas de Alvarás e Licenças). */
export const PROFISSIONAL_DOCUMENTO_ALERTA_60_DIAS = 60;
export const PROFISSIONAL_DOCUMENTO_ALERTA_30_DIAS = 30;

export const PROFISSIONAL_DOCUMENTO_ALERTAS = ['alerta-60', 'alerta-30', 'vencido'] as const;
export type ProfissionalDocumentoAlerta = (typeof PROFISSIONAL_DOCUMENTO_ALERTAS)[number];

/**
 * Tipos obrigatórios por profissão. PROVISÓRIO: a lista por profissão aguarda confirmação do
 * cliente (issue #141, "Precisa de confirmação"). Alterar só este mapa muda a regra.
 */
export type ProfissaoDocumento =
  'MEDICO' | 'PSICOLOGO' | 'NUTRICIONISTA' | 'FISIOTERAPEUTA' | 'BIOMEDICO' | 'OUTRA';

const OBRIGATORIOS_BASE: readonly ProfissionalDocumentoTipo[] = [
  'CONTRATO',
  'DOCUMENTO_PESSOAL',
  'REGISTRO_CONSELHO',
];

export const PROFISSIONAL_DOCUMENTO_OBRIGATORIOS: Readonly<
  Record<ProfissaoDocumento, readonly ProfissionalDocumentoTipo[]>
> = {
  MEDICO: OBRIGATORIOS_BASE,
  PSICOLOGO: OBRIGATORIOS_BASE,
  NUTRICIONISTA: OBRIGATORIOS_BASE,
  FISIOTERAPEUTA: OBRIGATORIOS_BASE,
  BIOMEDICO: OBRIGATORIOS_BASE,
  OUTRA: ['CONTRATO', 'DOCUMENTO_PESSOAL'],
};

/** Tipos obrigatórios da profissão (sem profissão informada, usa o conjunto base). */
export function tiposObrigatorios(
  profissao: ProfissaoDocumento | null | undefined,
): readonly ProfissionalDocumentoTipo[] {
  return profissao ? PROFISSIONAL_DOCUMENTO_OBRIGATORIOS[profissao] : OBRIGATORIOS_BASE;
}

const MS_DIA = 86_400_000;

/** Dias de `hoje` até `validade` (ambos `AAAA-MM-DD`); negativo = vencido. */
export function diasParaVencer(validade: string, hoje: string): number {
  return Math.round(
    (Date.parse(`${validade}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / MS_DIA,
  );
}

/** Situação efetiva: a gravada, ou `VENCIDO` quando a validade já passou (vale para qualquer gravada). */
export function situacaoEfetiva(
  gravada: ProfissionalDocumentoSituacaoGravada,
  validade: string | null,
  hoje: string,
): ProfissionalDocumentoSituacao {
  if (validade && diasParaVencer(validade, hoje) < 0) return 'VENCIDO';
  return gravada;
}

/** Faixa de alerta da validade; `null` sem validade ou com mais de 60 dias. */
export function alertaDoDocumento(
  validade: string | null,
  hoje: string,
): ProfissionalDocumentoAlerta | null {
  if (!validade) return null;
  const dias = diasParaVencer(validade, hoje);
  if (dias < 0) return 'vencido';
  if (dias <= PROFISSIONAL_DOCUMENTO_ALERTA_30_DIAS) return 'alerta-30';
  if (dias <= PROFISSIONAL_DOCUMENTO_ALERTA_60_DIAS) return 'alerta-60';
  return null;
}

// --- Campos ------------------------------------------------------------------------------

export const PROFISSIONAL_DOCUMENTO_NUMERO_MAX = 60;
export const PROFISSIONAL_DOCUMENTO_OBSERVACAO_MAX = 500;
export const PROFISSIONAL_DOCUMENTO_MOTIVO_MAX = 500;

const dataOpcional = z
  .string({ error: () => traduzirValidacao('validacao.formato.date') })
  .nullish()
  .transform((valor) => valor || null)
  .pipe(z.iso.date({ error: () => traduzirValidacao('validacao.formato.date') }).nullable());

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string()
    .trim()
    .max(max, {
      error: () => traduzirValidacao('validacao.campoMax', { campo: rotulo, count: max }),
    })
    .nullish()
    .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/profissionais/:id/documentos`. O arquivo é
 * enviado antes em `/api/arquivos?uso=documento-profissional`. Qualquer alteração (inclusive
 * trocar o arquivo) devolve o documento para `ENVIADO` e limpa a validação.
 */
export const profissionalDocumentoInputSchema = z
  .strictObject({
    tipo: z
      .string({ error: erroObrigatorio('Tipo') })
      .min(1, { error: erroObrigatorio('Tipo') })
      .pipe(profissionalDocumentoTipoSchema),
    arquivoId: z
      .string({ error: erroObrigatorio('Arquivo', 'm') })
      .min(1, { error: erroObrigatorio('Arquivo', 'm') })
      .pipe(z.uuid({ error: () => traduzirValidacao('validacao.formato.uuid') })),
    numero: textoOpcional(PROFISSIONAL_DOCUMENTO_NUMERO_MAX, 'Número'),
    emissao: dataOpcional,
    validade: dataOpcional,
    observacao: textoOpcional(PROFISSIONAL_DOCUMENTO_OBSERVACAO_MAX, 'Observação'),
  })
  .superRefine((d, ctx) => {
    if (d.emissao && d.validade && d.validade < d.emissao) {
      ctx.addIssue({
        code: 'custom',
        path: ['validade'],
        message: traduzirValidacao('validacao.periodo.invalido'),
      });
    }
  });
export type ProfissionalDocumentoInput = z.infer<typeof profissionalDocumentoInputSchema>;

/** Corpo de `POST .../documentos/:documentoId/validacao`: validar ou recusar (recusa exige motivo). */
export const PROFISSIONAL_DOCUMENTO_DECISOES = ['VALIDAR', 'RECUSAR'] as const;
export const profissionalDocumentoDecisaoSchema = z
  .strictObject({
    decisao: z.enum(PROFISSIONAL_DOCUMENTO_DECISOES, {
      error: () => traduzirValidacao('validacao.opcaoInvalida'),
    }),
    motivo: textoOpcional(PROFISSIONAL_DOCUMENTO_MOTIVO_MAX, 'Motivo'),
  })
  .superRefine((d, ctx) => {
    if (d.decisao === 'RECUSAR' && !d.motivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivo'],
        message: traduzirValidacao('validacao.obrigatorio', { campo: 'Motivo', genero: 'm' }),
      });
    }
  })
  .transform((d) => (d.decisao === 'VALIDAR' ? { ...d, motivo: null } : d));
export type ProfissionalDocumentoDecisao = z.infer<typeof profissionalDocumentoDecisaoSchema>;

// --- Respostas ---------------------------------------------------------------------------

export const profissionalDocumentoSchema = z.object({
  id: z.uuid(),
  profissionalId: z.uuid(),
  tipo: profissionalDocumentoTipoSchema,
  arquivoId: z.uuid(),
  arquivoNome: z.string().nullable(),
  numero: z.string().nullable(),
  emissao: z.string().nullable(),
  validade: z.string().nullable(),
  observacao: z.string().nullable(),
  situacao: profissionalDocumentoSituacaoSchema,
  alerta: z.enum(PROFISSIONAL_DOCUMENTO_ALERTAS).nullable(),
  diasParaVencer: z.number().int().nullable(),
  motivoRecusa: z.string().nullable(),
  validadoPorId: z.string().nullable(),
  validadoPorNome: z.string().nullable(),
  validadoEm: z.string().nullable(),
  createdAt: z.string(),
});
export type ProfissionalDocumento = z.infer<typeof profissionalDocumentoSchema>;

/** `GET .../profissionais/:id/documentos`: lista, obrigatórios sem envio e se a documentação está completa. */
export const profissionalDocumentosResponseSchema = z.object({
  data: z.array(profissionalDocumentoSchema),
  pendentes: z.array(profissionalDocumentoTipoSchema),
  /** Todos os tipos obrigatórios têm documento `VALIDADO` e não vencido (etapa do onboarding, #142). */
  documentacaoValidada: z.boolean(),
});
export type ProfissionalDocumentosResponse = z.infer<typeof profissionalDocumentosResponseSchema>;

/** `GET .../documentos/alertas` (insumo da central de notificações, #160): vencidos e a vencer em 60 dias. */
export const profissionalDocumentoAlertaSchema = profissionalDocumentoSchema.extend({
  profissionalNome: z.string(),
});
export const profissionalDocumentoAlertasResponseSchema = z.object({
  data: z.array(profissionalDocumentoAlertaSchema),
});
export type ProfissionalDocumentoAlertasResponse = z.infer<
  typeof profissionalDocumentoAlertasResponseSchema
>;
