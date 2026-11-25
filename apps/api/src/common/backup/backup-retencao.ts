import type { BackupRetencao } from './backup.config';

export interface DumpGuardado {
  chave: string;
  data: Date;
}

/** `torres-20261125T050000Z.dump.enc` → data do dump (UTC). `null` se o nome não segue o padrão. */
export function dataDaChave(chave: string): Date | null {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(chave);
  if (!m) return null;
  const [ano, mes, dia, hora, minuto, segundo] = m.slice(1).map(Number);
  return new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia, hora, minuto, segundo));
}

export function carimboDaData(data: Date): string {
  return data
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function semanaIso(data: Date): string {
  const copia = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const diaSemana = copia.getUTCDay() || 7;
  copia.setUTCDate(copia.getUTCDate() + 4 - diaSemana);
  const inicioAno = Date.UTC(copia.getUTCFullYear(), 0, 1);
  const semana = Math.ceil(((copia.getTime() - inicioAno) / 86_400_000 + 1) / 7);
  return `${copia.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/** Mantém o dump mais recente de cada período, nos N períodos mais recentes. */
function maisRecentesPor(
  dumps: readonly DumpGuardado[],
  periodo: (data: Date) => string,
  quantos: number,
): Set<string> {
  const mantidos = new Set<string>();
  const vistos = new Set<string>();
  for (const dump of dumps) {
    const chavePeriodo = periodo(dump.data);
    if (vistos.has(chavePeriodo)) continue;
    if (vistos.size >= quantos) break;
    vistos.add(chavePeriodo);
    mantidos.add(dump.chave);
  }
  return mantidos;
}

/**
 * Política de retenção (avô-pai-filho): guarda o último dump de cada um dos N dias, N semanas e
 * N meses mais recentes. Devolve as chaves que podem ser apagadas. O dump mais recente nunca
 * sai, mesmo com a retenção zerada.
 */
export function selecionarExpirados(
  dumps: readonly DumpGuardado[],
  retencao: BackupRetencao,
): string[] {
  const ordenados = [...dumps].sort((a, b) => b.data.getTime() - a.data.getTime());
  const mantidos = new Set<string>([
    ...maisRecentesPor(ordenados, (d) => d.toISOString().slice(0, 10), retencao.diarios),
    ...maisRecentesPor(ordenados, semanaIso, retencao.semanais),
    ...maisRecentesPor(ordenados, (d) => d.toISOString().slice(0, 7), retencao.mensais),
  ]);
  if (ordenados[0]) mantidos.add(ordenados[0].chave);
  return ordenados.filter((dump) => !mantidos.has(dump.chave)).map((dump) => dump.chave);
}
