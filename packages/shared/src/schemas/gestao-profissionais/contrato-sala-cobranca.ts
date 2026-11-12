import { z } from 'zod';

/** `AAAA-MM`, o mês de competência da cobrança. */
export const competenciaSchema = z
  .string({ error: 'Informe o mês' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Mês inválido. Use AAAA-MM' });

/** "2026-10" → "10/2026". */
export function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  return `${mes}/${ano}`;
}

/** Um contrato sem cobrança gerada automaticamente no resumo de "Gerar Cobranças do Mês". */
export const contratoSemValorCalculavelSchema = z.object({
  contratoId: z.uuid(),
  salaNome: z.string(),
  locatarioNome: z.string(),
});
export type ContratoSemValorCalculavel = z.infer<typeof contratoSemValorCalculavelSchema>;

/** Resposta de `POST .../contratos-sala/gerar-cobrancas-mes`. */
export const gerarCobrancasMesResumoSchema = z.object({
  competencia: z.string(),
  geradas: z.number().int(),
  jaExistentes: z.number().int(),
  semValorCalculavel: z.array(contratoSemValorCalculavelSchema),
});
export type GerarCobrancasMesResumo = z.infer<typeof gerarCobrancasMesResumoSchema>;

/**
 * Aviso "Gerar Cobranças do Mês" (issue #115): "0 conta(s) a receber gerada(s) para 10/2026; 4
 * contrato(s) já tinham a parcela do mês; 6 contrato(s) sem valor calculável (ids …)".
 */
export function descreverResumoGerarCobrancas(resumo: GerarCobrancasMesResumo): string {
  const partes = [
    `${resumo.geradas} conta(s) a receber gerada(s) para ${formatarCompetencia(resumo.competencia)}`,
    `${resumo.jaExistentes} contrato(s) já tinham a parcela do mês`,
  ];
  if (resumo.semValorCalculavel.length > 0) {
    const ids = resumo.semValorCalculavel.map((c) => c.contratoId).join(', ');
    partes.push(`${resumo.semValorCalculavel.length} contrato(s) sem valor calculável (ids ${ids})`);
  }
  return `${partes.join('; ')}.`;
}

/**
 * Corpo de `POST .../contratos-sala/:id/gerar-parcela` (linha "Contrato sem cobrança"): gera a
 * parcela do mês informando o valor, já que não há regra automática para calculá-lo.
 */
export const gerarParcelaContratoSchema = z.strictObject({
  competencia: competenciaSchema,
  valor: z
    .number({ error: 'Informe o valor' })
    .positive({ error: 'O valor deve ser maior que zero' }),
  dataVencimento: z.iso.date({ error: 'Data de vencimento inválida' }),
});
export type GerarParcelaContratoFormulario = z.input<typeof gerarParcelaContratoSchema>;
export type GerarParcelaContratoInput = z.output<typeof gerarParcelaContratoSchema>;

/**
 * Corpo de `POST .../contratos-sala/:id/confirmar-sem-cobranca`: o usuário confirma que o
 * contrato não terá cobrança naquele mês (ex.: combinado informalmente), parando o aviso.
 */
export const confirmarSemCobrancaSchema = z.strictObject({
  competencia: competenciaSchema,
});
export type ConfirmarSemCobrancaInput = z.infer<typeof confirmarSemCobrancaSchema>;

/** Corpo de `POST .../contratos-sala/:id/horas/gerar-cobranca` (modal "Horas Utilizadas"). */
export const gerarCobrancaHorasSchema = z.strictObject({
  mes: competenciaSchema,
});
export type GerarCobrancaHorasInput = z.infer<typeof gerarCobrancaHorasSchema>;
