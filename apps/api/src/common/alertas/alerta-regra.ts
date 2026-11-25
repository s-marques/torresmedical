import type { TipoAlerta } from '@torres/shared';

/**
 * Regra de um alerta da central de notificações (issue #160). Cada módulo dono do dado implementa
 * as suas e as expõe por um service exportado; o Painel só reúne e executa, sem ler tabelas alheias.
 */
export interface AlertaRegra {
  readonly tipo: TipoAlerta;
  /** Quantos registros cumprem a regra em `hoje` (`AAAA-MM-DD`, fuso da clínica). */
  contar(hoje: string): Promise<number>;
}

/** Service exportado por um módulo que contribui com alertas. */
export interface FonteAlertas {
  regras(): readonly AlertaRegra[];
}

export const ALERTA_REGRAS = Symbol('ALERTA_REGRAS');
