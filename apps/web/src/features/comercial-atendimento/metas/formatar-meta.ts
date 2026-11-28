import { META_METRICA_MONETARIA, type MetaMetrica, type MetaPeriodoTipo } from '@torres/shared';
import type { TFunction } from 'i18next';
import { formatoData, formatoNumero } from '@/lib/i18n';
import { formatarMoeda } from '@/lib/forms/mascaras';

/** Reais na receita nova; contagem nas demais métricas. */
export function formatarValorMeta(metrica: MetaMetrica, valor: number): string {
  return metrica === META_METRICA_MONETARIA
    ? formatarMoeda(valor)
    : formatoNumero({ maximumFractionDigits: 0 }).format(valor);
}

export function formatarPercentual(percentual: number | null): string {
  return percentual === null
    ? '-'
    : `${formatoNumero({ maximumFractionDigits: 1 }).format(percentual)}%`;
}

/** `2026-11` → "novembro de 2026"; `2026-T4` → "4º trimestre de 2026" (no idioma do usuário). */
export function rotuloPeriodo(t: TFunction, tipo: MetaPeriodoTipo, periodo: string): string {
  const [ano = '', resto = ''] = periodo.split('-');
  if (tipo === 'TRIMESTRE') return t('metas.trimestre', { n: resto.replace('T', ''), ano });
  return formatoData({ month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(ano), Number(resto) - 1, 1)),
  );
}

/** Períodos escolhíveis: o ano anterior, o atual e o seguinte. */
export function opcoesDePeriodo(
  t: TFunction,
  tipo: MetaPeriodoTipo,
  anoBase = new Date().getFullYear(),
): { valor: string; rotulo: string }[] {
  const itens = tipo === 'MES' ? 12 : 4;
  return [anoBase - 1, anoBase, anoBase + 1].flatMap((ano) =>
    Array.from({ length: itens }, (_, i) => {
      const valor =
        tipo === 'MES' ? `${ano}-${String(i + 1).padStart(2, '0')}` : `${ano}-T${i + 1}`;
      return { valor, rotulo: rotuloPeriodo(t, tipo, valor) };
    }),
  );
}

/** Período corrente no formato do tipo, para preencher o formulário. */
export function periodoAtual(tipo: MetaPeriodoTipo, hoje = new Date()): string {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  return tipo === 'MES'
    ? `${ano}-${String(mes).padStart(2, '0')}`
    : `${ano}-T${Math.ceil(mes / 3)}`;
}
