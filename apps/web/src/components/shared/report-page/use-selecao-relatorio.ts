import type { SelecaoRelatorio } from '@torres/shared';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';

export const PARAMETRO_RELATORIO = 'relatorio';

/** Dias do período padrão: os últimos 30 dias até hoje (o print do inventário mostra 30 dias). */
export const DIAS_PERIODO_PADRAO = 30;

/** Data local `AAAA-MM-DD` (o `toISOString` usaria UTC e poderia mudar o dia). */
export function dataLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function periodoPadrao(hoje = new Date()): { de: string; ate: string } {
  const inicio = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate() - DIAS_PERIODO_PADRAO,
  );
  return { de: dataLocal(inicio), ate: dataLocal(hoje) };
}

/**
 * Próxima query string ao aplicar a seleção. Trocar de relatório descarta os parâmetros do
 * anterior (ordenação, filtros, página); mudar o período só volta para a primeira página.
 */
export function aplicarSelecao(
  atuais: URLSearchParams,
  selecao: SelecaoRelatorio,
): URLSearchParams {
  const relatorioAtual = atuais.get(PARAMETRO_RELATORIO) ?? '';
  const igual =
    relatorioAtual === selecao.relatorio &&
    atuais.get('de') === selecao.de &&
    atuais.get('ate') === selecao.ate;
  if (igual) return atuais;

  const proximo =
    relatorioAtual === selecao.relatorio ? new URLSearchParams(atuais) : new URLSearchParams();
  proximo.delete('page');
  if (selecao.relatorio) proximo.set(PARAMETRO_RELATORIO, selecao.relatorio);
  else proximo.delete(PARAMETRO_RELATORIO);
  proximo.set('de', selecao.de);
  proximo.set('ate', selecao.ate);
  return proximo;
}

/**
 * Relatório e período aplicados, guardados na URL (`?relatorio=&de=&ate=`) para o link manter
 * a mesma consulta. Sem período na URL, vale o padrão.
 */
export function useSelecaoRelatorio() {
  const [params, setParams] = useSearchParams();
  const [padrao] = useState(periodoPadrao);
  const selecao: SelecaoRelatorio = {
    relatorio: params.get(PARAMETRO_RELATORIO) ?? '',
    de: params.get('de') ?? padrao.de,
    ate: params.get('ate') ?? padrao.ate,
  };
  const aplicar = useCallback(
    (nova: SelecaoRelatorio) =>
      setParams((atuais) => aplicarSelecao(atuais, nova), { replace: true }),
    [setParams],
  );
  return { selecao, aplicar };
}
