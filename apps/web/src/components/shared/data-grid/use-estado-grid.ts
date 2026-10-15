import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { aplicarMudancas, lerEstadoGrid, type EstadoGrid } from './estado-grid';
import type { ValidadorConsulta } from './tipos';

export interface OpcoesEstadoGrid {
  parametros: readonly string[];
  tamanhos: readonly number[];
  querySchema?: ValidadorConsulta;
}

/**
 * Estado do grid (página, tamanho, ordenação, busca e filtros) guardado na query string, para
 * o link e o "voltar" do navegador manterem a mesma visão. Atualiza a URL com `replace`.
 */
export function useEstadoGrid({ parametros, tamanhos, querySchema }: OpcoesEstadoGrid) {
  const [params, setParams] = useSearchParams();
  const chaveParametros = parametros.join(',');
  const chaveTamanhos = tamanhos.join(',');

  // Os arrays costumam ser recriados a cada render: a memória depende só do conteúdo.
  const estado: EstadoGrid = useMemo(
    () =>
      lerEstadoGrid(params, {
        parametros: chaveParametros.split(',').filter(Boolean),
        tamanhos: chaveTamanhos.split(',').filter(Boolean).map(Number),
        querySchema,
      }),
    [params, chaveParametros, chaveTamanhos, querySchema],
  );

  const tamanhoPadrao = tamanhos[0] ?? 10;
  const alterar = useCallback(
    (mudancas: Readonly<Record<string, string | number | undefined>>) =>
      setParams((atuais) => aplicarMudancas(atuais, mudancas, tamanhoPadrao), { replace: true }),
    [setParams, tamanhoPadrao],
  );

  return { estado, alterar };
}
