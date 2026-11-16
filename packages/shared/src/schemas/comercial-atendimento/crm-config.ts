import { z } from 'zod';
import { textoObrigatorio } from '../common/obrigatorio';

/**
 * Modal "Configurações do CRM" da tela Pipeline (`/crm`): pipelines, estágios de cada pipeline
 * e motivos de perda. As origens do negócio são as Origens de Cliente (`origem-cliente.ts`).
 */

export const PIPELINE_NOME_MAX = 120;
export const ESTAGIO_NOME_MAX = 120;
export const MOTIVO_PERDA_NOME_MAX = 120;

/** Cor padrão do seletor "Adicionar estágio" (azul do print). */
export const ESTAGIO_COR_PADRAO = '#3b82f6';

/**
 * Marco do dashboard: a data é gravada no negócio quando ele entra no estágio
 * (select "Marco: nenhum / Primeiro contato / Visita / Proposta / Contrato").
 */
export const MARCOS_ESTAGIO = ['PRIMEIRO_CONTATO', 'VISITA', 'PROPOSTA', 'CONTRATO'] as const;
export type MarcoEstagio = (typeof MARCOS_ESTAGIO)[number];

export const MARCO_ESTAGIO_ROTULO: Readonly<Record<MarcoEstagio, string>> = {
  PRIMEIRO_CONTATO: 'Primeiro contato',
  VISITA: 'Visita',
  PROPOSTA: 'Proposta',
  CONTRATO: 'Contrato',
};

const corHex = z
  .string({ error: 'Cor é obrigatória.' })
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Cor inválida. Use o formato #RRGGBB' })
  .transform((cor) => cor.toLowerCase());

const marco = z
  .enum(MARCOS_ESTAGIO, { error: 'Marco inválido' })
  .nullish()
  .transform((valor) => valor ?? null);

/** `POST /pipelines` e `PATCH /pipelines/:id`: "Nome do novo pipeline" e renomear. */
export const pipelineInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: PIPELINE_NOME_MAX }),
});
export type PipelineInput = z.output<typeof pipelineInputSchema>;

/** `POST /pipelines/:id/estagios` e `PATCH /estagios/:id`: "Adicionar estágio" e editar. */
export const estagioInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: ESTAGIO_NOME_MAX }),
  cor: corHex,
  marco,
});
export type EstagioInput = z.output<typeof estagioInputSchema>;
export type EstagioFormulario = z.input<typeof estagioInputSchema>;

/** `POST /motivos-perda` e `PATCH /motivos-perda/:id`: "Nome do motivo". O código vem do nome. */
export const motivoPerdaInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: MOTIVO_PERDA_NOME_MAX }),
});
export type MotivoPerdaInput = z.output<typeof motivoPerdaInputSchema>;

export const estagioSchema = z.object({
  id: z.uuid(),
  pipelineId: z.uuid(),
  nome: z.string(),
  cor: z.string(),
  marco: z.enum(MARCOS_ESTAGIO).nullable(),
  ordem: z.number().int(),
  /** Negócios no estágio (abertos, ganhos e perdidos), como no contador do modal. */
  quantidade: z.number().int(),
});
export type Estagio = z.infer<typeof estagioSchema>;

export const pipelineSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  ordem: z.number().int(),
  estagios: z.array(estagioSchema),
});
export type Pipeline = z.infer<typeof pipelineSchema>;

export const pipelineListaSchema = z.array(pipelineSchema);

export const motivoPerdaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  codigo: z.string(),
  ordem: z.number().int(),
});
export type MotivoPerda = z.infer<typeof motivoPerdaSchema>;

export const motivoPerdaListaSchema = z.array(motivoPerdaSchema);
