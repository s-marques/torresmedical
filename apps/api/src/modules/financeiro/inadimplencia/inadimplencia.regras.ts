import { DIAS_DO_MARCO, faixaDoAtraso, type FaixaAging, type MarcoCobranca } from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';

const ZERO = new Prisma.Decimal(0);
const MS_POR_DIA = 86_400_000;

/** `AAAA-MM-DD` como instante UTC à meia-noite (as colunas `@db.Date` vêm assim). */
const instanteDoDia = (dia: string) => Date.parse(`${dia}T00:00:00.000Z`);

/** Dias de `de` até `ate` (`AAAA-MM-DD`); positivo quando `ate` é depois. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((instanteDoDia(ate) - instanteDoDia(de)) / MS_POR_DIA);
}

/** Soma `dias` (pode ser negativo) a um dia `AAAA-MM-DD`. */
export function somarDias(dia: string, dias: number): string {
  return new Date(instanteDoDia(dia) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Vencimento dos títulos que estão no marco hoje: 3 dias antes = vence daqui a 3 dias. */
export function vencimentoDoMarco(marco: MarcoCobranca, hoje: string): string {
  return somarDias(hoje, -DIAS_DO_MARCO[marco]);
}

/** Marco da régua em que o título está hoje, ou `null` quando hoje não é dia de cobrança. */
export function marcoDoTitulo(vencimento: string, hoje: string): MarcoCobranca | null {
  const dias = diasEntre(vencimento, hoje);
  const achado = Object.entries(DIAS_DO_MARCO).find(([, d]) => d === dias);
  return (achado?.[0] as MarcoCobranca | undefined) ?? null;
}

/** Saldo em aberto: valor menos as baixas, nunca negativo. */
export function saldoEmAberto(
  valor: Prisma.Decimal,
  baixas: readonly { valorRecebido: Prisma.Decimal }[],
): Prisma.Decimal {
  const recebido = baixas.reduce((total, b) => total.add(b.valorRecebido), ZERO);
  return Prisma.Decimal.max(valor.sub(recebido), ZERO);
}

/** Título com saldo em aberto, no formato que o painel e a régua consomem. */
export interface TituloEmAberto {
  id: string;
  /** Vencimento `AAAA-MM-DD`. */
  vencimento: string;
  saldo: Prisma.Decimal;
}

/** Dias de atraso em `hoje` (zero quando ainda não venceu). */
export function diasEmAtraso(vencimento: string, hoje: string): number {
  return Math.max(diasEntre(vencimento, hoje), 0);
}

/** Vencido: vencimento antes de hoje e saldo em aberto. */
export function estaVencido(titulo: TituloEmAberto, hoje: string): boolean {
  return titulo.saldo.greaterThan(ZERO) && titulo.vencimento < hoje;
}

export interface Soma {
  valor: Prisma.Decimal;
  quantidade: number;
}

export function somar(titulos: readonly TituloEmAberto[]): Soma {
  return {
    valor: titulos.reduce((total, t) => total.add(t.saldo), ZERO),
    quantidade: titulos.length,
  };
}

/** Quebra os títulos vencidos nas faixas do aging (0 a 30, 31 a 60 e mais de 60 dias). */
export function agruparPorFaixa(
  vencidos: readonly TituloEmAberto[],
  hoje: string,
): Record<FaixaAging, Soma> {
  const grupos: Record<FaixaAging, TituloEmAberto[]> = {
    ATE_30: [],
    DE_31_A_60: [],
    ACIMA_60: [],
  };
  for (const titulo of vencidos) {
    grupos[faixaDoAtraso(diasEmAtraso(titulo.vencimento, hoje))].push(titulo);
  }
  return {
    ATE_30: somar(grupos.ATE_30),
    DE_31_A_60: somar(grupos.DE_31_A_60),
    ACIMA_60: somar(grupos.ACIMA_60),
  };
}
