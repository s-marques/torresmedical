import { z } from 'zod';

/** Por que um cadastro existente parece o mesmo paciente (issue #149). */
export const PACIENTE_DUPLICIDADE_MOTIVOS = ['TELEFONE', 'EMAIL', 'NOME_NASCIMENTO'] as const;
export const pacienteDuplicidadeMotivoSchema = z.enum(PACIENTE_DUPLICIDADE_MOTIVOS);
export type PacienteDuplicidadeMotivo = z.infer<typeof pacienteDuplicidadeMotivoSchema>;

export const PACIENTE_DUPLICIDADE_MOTIVO_ROTULOS: Record<PacienteDuplicidadeMotivo, string> = {
  TELEFONE: 'Mesmo telefone',
  EMAIL: 'Mesmo e-mail',
  NOME_NASCIMENTO: 'Mesmo nome e data de nascimento',
};

/** Código do 409 de `POST`/`PATCH` quando há possível duplicado e o envio não foi confirmado. */
export const PACIENTE_POSSIVEL_DUPLICADO = 'PACIENTE_POSSIVEL_DUPLICADO';

const textoAparado = z.string().trim().max(200).nullish();

/**
 * Corpo de `POST /api/comercial-atendimento/pacientes/duplicidade`: os dados que identificam o
 * paciente. Vai no corpo (não na URL) porque são dados pessoais. Com `pacienteId` (edição), só
 * conta o que mudou em relação ao cadastro atual e o próprio paciente fica de fora.
 */
export const verificarDuplicidadePacienteSchema = z.strictObject({
  pacienteId: z.uuid().nullish(),
  nome: textoAparado,
  email: textoAparado,
  telefone: textoAparado,
  celular: textoAparado,
  dataNascimento: z
    .union([z.literal(''), z.iso.date()])
    .nullish()
    .transform((valor) => valor || null),
});

export type VerificarDuplicidadePacienteInput = z.input<typeof verificarDuplicidadePacienteSchema>;
export type VerificarDuplicidadePaciente = z.output<typeof verificarDuplicidadePacienteSchema>;

export const pacientePossivelDuplicadoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  /** CPF parcialmente oculto; `null` para quem não tem `verDadosSensiveis` (ou sem CPF). */
  cpfMascarado: z.string().nullable(),
  dataNascimento: z.iso.date().nullable(),
  motivos: z.array(pacienteDuplicidadeMotivoSchema).min(1),
});
export type PacientePossivelDuplicado = z.infer<typeof pacientePossivelDuplicadoSchema>;

export const verificacaoDuplicidadePacienteSchema = z.object({
  candidatos: z.array(pacientePossivelDuplicadoSchema),
});
export type VerificacaoDuplicidadePaciente = z.infer<typeof verificacaoDuplicidadePacienteSchema>;
