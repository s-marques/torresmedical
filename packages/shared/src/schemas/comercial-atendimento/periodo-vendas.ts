import { z } from 'zod';

export const PERIODO_CONSULTA_INVALIDO = 'A data inicial deve ser anterior ou igual à final';

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataValida(valor: string): boolean {
  const partes = DATA.exec(valor);
  if (!partes) return false;
  const [ano, mes, dia] = partes.slice(1).map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

/** Data do calendário (`AAAA-MM-DD`) opcional: vazio vira ausente. */
export function dataSchemaOpcional(qual: 'inicial' | 'final') {
  return z
    .string()
    .trim()
    .refine((valor) => valor === '' || dataValida(valor), { error: `Data ${qual} inválida` })
    .optional()
    .transform((valor) => valor || undefined);
}

/** Fuso da clínica (sem horário de verão desde 2019). */
const FUSO_CLINICA = '-03:00';

/** Intervalo `[inicio, fim)` em UTC do período De/Até, no dia do calendário da clínica. */
export function intervaloDoPeriodo(
  de: string | undefined,
  ate: string | undefined,
): { inicio?: Date; fim?: Date } {
  const intervalo: { inicio?: Date; fim?: Date } = {};
  if (de) intervalo.inicio = new Date(`${de}T00:00:00.000${FUSO_CLINICA}`);
  if (ate) {
    const fim = new Date(`${ate}T00:00:00.000${FUSO_CLINICA}`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    intervalo.fim = fim;
  }
  return intervalo;
}
