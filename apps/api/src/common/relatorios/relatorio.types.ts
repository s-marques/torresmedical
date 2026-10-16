import type { FiltroRelatorio, Permissao, Sort, SortDirection } from '@torres/shared';
import type { ExportColumn } from '../export/export.types';

/**
 * Coluna do relatório: a mesma definição monta a linha do grid (`value` pelo `key`) e a
 * exportação Excel/PDF. O `type` define a formatação nos dois.
 */
export interface ColunaRelatorioDef<T> extends ExportColumn<T> {
  /** Pode ordenar por ela (`sort=<key>:asc|desc`). A definição traduz para a consulta. */
  ordenavel?: boolean;
}

/** Filtros já validados pelo schema do relatório. */
export interface ConsultaRelatorio {
  /** Datas do calendário (`AAAA-MM-DD`), como o usuário escolheu. */
  periodo: { de: string; ate: string };
  /** O período como instantes no fuso da clínica: `gte` às 00:00 de "De", `lt` às 00:00 do dia seguinte a "Até". */
  intervalo: { gte: Date; lt: Date };
  /** Ausente quando o relatório não tem colunas ordenáveis. */
  sort?: Sort;
  /** Filtros extras, pelo `parametro`. */
  filtros: Readonly<Record<string, string | undefined>>;
}

export interface PaginaConsulta {
  skip: number;
  take: number;
}

/**
 * Como o relatório roda. Hoje tudo é síncrono (limite de `EXPORT_MAX_ROWS` na exportação).
 * `fila` fica reservado para relatórios pesados, quando a mensageria existir (ver `relatorio-fila.ts`).
 */
export type ExecucaoRelatorio = 'sincrona' | 'fila';

/**
 * Relatório registrado por um módulo (`ReportDefinition`). Aparece no seletor da tela de
 * Relatórios do módulo para quem tem `<modulo>.relatorios.ver` e, se houver, `permissao`.
 */
export interface ReportDefinition<T = unknown> {
  /** Código exibido no seletor, ex.: `FIN-01`. Também é o `:id` da rota. */
  id: string;
  nome: string;
  /** Permissão exigida além da tela (ex.: a da tela dona dos dados). Sem ela: fora do seletor e 403. */
  permissao?: Permissao;
  /** Ao menos uma. */
  colunas: readonly ColunaRelatorioDef<T>[];
  /** Ex.: `nome:asc`. Obrigatória quando há colunas ordenáveis. */
  ordenacaoPadrao?: `${string}:${SortDirection}`;
  /** Filtros além do período. */
  filtros?: readonly FiltroRelatorio[];
  execucao?: ExecucaoRelatorio;
  /** Linhas do relatório; sem `pagina`, todas (exportação). */
  buscar(consulta: ConsultaRelatorio, pagina?: PaginaConsulta): Promise<T[]>;
  contar(consulta: ConsultaRelatorio): Promise<number>;
}

/** Fornece os relatórios de um módulo (provider Nest, para usar os services do módulo). */
export interface ProvedorRelatorios {
  readonly relatorios: readonly ReportDefinition[];
}

/** Declara um relatório com o tipo da linha e o guarda na lista do módulo. */
export function definirRelatorio<T>(definicao: ReportDefinition<T>): ReportDefinition {
  return definicao as unknown as ReportDefinition;
}
