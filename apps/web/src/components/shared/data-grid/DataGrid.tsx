import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  columnVisibilityFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type RowData,
} from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, MoreHorizontalIcon } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api/client';
import { usePermissoes } from '@/lib/auth/use-sessao';
import { cn } from '@/lib/utils';
import { EmptyState } from '../EmptyState';
import { ChipsStatus, CampoBusca, FiltrosExtras, MenuColunas, MenuExportar } from './DataGridBarra';
import { DataGridPaginacao } from './DataGridPaginacao';
import {
  consultaDaListagem,
  direcaoOrdenacao,
  PARAMETRO_STATUS,
  parametrosDosFiltros,
  proximaOrdenacao,
  TAMANHOS_PAGINA,
} from './estado-grid';
import type { AcaoLinha, ColunaGrid, DataGridProps } from './tipos';
import { useEstadoGrid } from './use-estado-grid';
import { useExportacao } from './use-exportacao';

const FEATURES = tableFeatures({ columnVisibilityFeature });
const COLUNA_ACOES = '__acoes';
const SEM_LINHAS: never[] = [];
const LINHAS_CARREGANDO = 3;

type Definicao<T extends RowData> = ColumnDef<typeof FEATURES, T>;

function idPadrao(linha: unknown): string {
  return String((linha as { id?: unknown }).id);
}

function valorPadrao(linha: unknown, id: string): ReactNode {
  const valor = (linha as Record<string, unknown>)[id];
  if (valor === null || valor === undefined || valor === '') return '-';
  return String(valor);
}

function campoDe(valor: boolean | string | undefined, id: string): string | undefined {
  if (valor === true) return id;
  return valor || undefined;
}

/**
 * Grid padrão do inventário (CLAUDE.md, seção 3): busca, chips de status, filtros, "Colunas",
 * ordenação, paginação no servidor, "Exportar", ações por linha e estado vazio. O estado fica
 * na URL e a listagem segue o contrato `{ data, meta }`. Ver a página `/dev/componentes`.
 */
export function DataGrid<T extends RowData>({
  url,
  schema,
  querySchema,
  colunas,
  idLinha = idPadrao,
  consultaFixa,
  busca = 'Buscar...',
  status,
  filtros,
  exportacao,
  acoes,
  aoClicarLinha,
  mensagemVazio = 'Nenhum resultado.',
  tamanhosPagina = TAMANHOS_PAGINA,
  resumo,
}: Readonly<DataGridProps<T>>) {
  const { estado, alterar } = useEstadoGrid({
    parametros: parametrosDosFiltros(status, filtros),
    tamanhos: tamanhosPagina,
    querySchema,
  });
  const query = { ...consultaDaListagem(estado), ...consultaFixa };
  const consulta = useQuery({
    queryKey: ['data-grid', url, query],
    queryFn: ({ signal }) => apiFetch(url, { query, schema, signal }),
    placeholderData: keepPreviousData,
  });

  const exportar = useExportacao({
    url: exportacao?.url ?? `${url}/export`,
    permissao: exportacao?.permissao,
    nomeArquivo: exportacao?.nomeArquivo,
    schema: exportacao?.schema,
    consultaFixa,
  });

  const [visibilidade, setVisibilidade] = useState<ColumnVisibilityState>(() =>
    Object.fromEntries(colunas.filter((c) => c.oculta).map((c) => [c.id, false])),
  );
  const definicoes = useMemo(() => montarDefinicoes(colunas, acoes), [colunas, acoes]);
  const porId = useMemo(() => new Map(colunas.map((c) => [c.id, c])), [colunas]);
  const table = useTable({
    features: FEATURES,
    columns: definicoes,
    data: consulta.data?.data ?? SEM_LINHAS,
    getRowId: (linha, indice) => idLinha(linha, indice),
    state: { columnVisibility: visibilidade },
    onColumnVisibilityChange: setVisibilidade,
  });

  const visiveis = table.getVisibleLeafColumns();
  const colunasExportadas = visiveis
    .map((coluna) => {
      const definicao = porId.get(coluna.id);
      return definicao && campoDe(definicao.exportavel, definicao.id);
    })
    .filter((chave): chave is string => Boolean(chave));
  const parametroStatus = status?.parametro ?? PARAMETRO_STATUS;
  const linhas = table.getRowModel().rows;

  return (
    <section className="grid gap-4" aria-label="Listagem">
      {status && (
        <ChipsStatus
          status={status}
          valor={estado.filtros[parametroStatus]}
          onChange={(valor) => alterar({ [parametroStatus]: valor })}
        />
      )}
      {filtros && filtros.length > 0 && (
        <FiltrosExtras filtros={filtros} valores={estado.filtros} onChange={alterar} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {busca === false ? (
          <span />
        ) : (
          <CampoBusca
            valor={estado.search}
            placeholder={busca}
            onChange={(search) => alterar({ search })}
          />
        )}
        <div className="flex items-center gap-2">
          {resumo && consulta.data && (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {resumo(consulta.data.meta)}
            </span>
          )}
          {exportacao && exportar.permitido && (
            <MenuExportar
              exportando={exportar.exportando}
              onExportar={(formato) => exportar.exportar(formato, colunasExportadas)}
            />
          )}
          <MenuColunas
            colunas={table
              .getAllLeafColumns()
              .filter((coluna) => coluna.getCanHide())
              .map((coluna) => ({
                id: coluna.id,
                titulo: porId.get(coluna.id)?.titulo ?? coluna.id,
                visivel: coluna.getIsVisible(),
                alternar: (visivel) => coluna.toggleVisibility(visivel),
              }))}
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table
          aria-busy={consulta.isFetching}
          className={cn(consulta.isPlaceholderData && 'opacity-60')}
        >
          <TableHeader>
            <TableRow>
              {visiveis.map((coluna) => (
                <Cabecalho
                  key={coluna.id}
                  coluna={porId.get(coluna.id)}
                  ordenacao={estado.sort}
                  onOrdenar={(sort) => alterar({ sort })}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <CorpoEspecial
              colunas={visiveis.length}
              carregando={consulta.isPending}
              erro={consulta.isError && !consulta.data}
              vazio={consulta.isSuccess && linhas.length === 0}
              mensagemVazio={mensagemVazio}
              onTentarDeNovo={() => void consulta.refetch()}
            />
            {linhas.map((linha) => (
              <TableRow
                key={linha.id}
                {...(aoClicarLinha && propsDeLinhaClicavel(() => aoClicarLinha(linha.original)))}
              >
                {linha.getVisibleCells().map((celula) => (
                  <TableCell key={celula.id} className={porId.get(celula.column.id)?.className}>
                    <table.FlexRender cell={celula} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DataGridPaginacao
        meta={consulta.data?.meta}
        page={estado.page}
        pageSize={estado.pageSize}
        tamanhos={tamanhosPagina}
        onPagina={(page) => alterar({ page })}
        onTamanho={(pageSize) => alterar({ pageSize })}
      />
    </section>
  );
}

const INTERATIVOS = 'button, a, input, select, textarea, [role="menu"], [role="menuitem"]';

/** Linha que abre algo ao clicar ou ao teclar Enter, sem competir com os controles dentro dela. */
function propsDeLinhaClicavel(abrir: () => void) {
  return {
    tabIndex: 0,
    className: 'cursor-pointer',
    onClick: (evento: MouseEvent<HTMLTableRowElement>) => {
      if (!(evento.target as HTMLElement).closest(INTERATIVOS)) abrir();
    },
    onKeyDown: (evento: KeyboardEvent<HTMLTableRowElement>) => {
      if (evento.key === 'Enter' && evento.target === evento.currentTarget) abrir();
    },
  };
}

function montarDefinicoes<T extends RowData>(
  colunas: readonly ColunaGrid<T>[],
  acoes: ((linha: T) => AcaoLinha[]) | undefined,
): Definicao<T>[] {
  const definicoes: Definicao<T>[] = colunas.map((coluna) => ({
    id: coluna.id,
    header: coluna.titulo,
    enableHiding: coluna.ocultavel !== false,
    cell: ({ row }) =>
      coluna.celula ? coluna.celula(row.original) : valorPadrao(row.original, coluna.id),
  }));
  if (acoes) {
    definicoes.push({
      id: COLUNA_ACOES,
      header: 'Ações',
      enableHiding: false,
      cell: ({ row }) => <AcoesDaLinha acoes={acoes(row.original)} />,
    });
  }
  return definicoes;
}

function Cabecalho<T>({
  coluna,
  ordenacao,
  onOrdenar,
}: Readonly<{ coluna?: ColunaGrid<T>; ordenacao?: string; onOrdenar: (sort?: string) => void }>) {
  if (!coluna) {
    return (
      <TableHead className="w-12">
        <span className="sr-only">Ações</span>
      </TableHead>
    );
  }
  const campo = campoDe(coluna.ordenavel, coluna.id);
  if (!campo) return <TableHead className={coluna.className}>{coluna.titulo}</TableHead>;

  const direcao = direcaoOrdenacao(ordenacao, campo);
  const Icone = { ascending: ArrowUpIcon, descending: ArrowDownIcon, none: ArrowUpDownIcon }[
    direcao
  ];
  return (
    <TableHead aria-sort={direcao} className={coluna.className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => onOrdenar(proximaOrdenacao(ordenacao, campo))}
      >
        {coluna.titulo}
        <Icone aria-hidden className={cn(direcao === 'none' && 'text-muted-foreground')} />
      </Button>
    </TableHead>
  );
}

function CorpoEspecial({
  colunas,
  carregando,
  erro,
  vazio,
  mensagemVazio,
  onTentarDeNovo,
}: Readonly<{
  colunas: number;
  carregando: boolean;
  erro: boolean;
  vazio: boolean;
  mensagemVazio: string;
  onTentarDeNovo: () => void;
}>) {
  if (carregando) {
    return Array.from({ length: LINHAS_CARREGANDO }, (_, i) => (
      <TableRow key={i} aria-hidden>
        <TableCell colSpan={colunas}>
          <Skeleton className="h-5 w-full" />
        </TableCell>
      </TableRow>
    ));
  }
  if (!erro && !vazio) return null;
  return (
    <TableRow>
      <TableCell colSpan={colunas} className="h-24 text-center">
        {erro ? (
          <div role="alert" className="flex flex-col items-center gap-2 text-sm text-destructive">
            Não foi possível carregar os dados.
            <Button type="button" variant="outline" size="sm" onClick={onTentarDeNovo}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <EmptyState titulo={mensagemVazio} className="py-4" />
        )}
      </TableCell>
    </TableRow>
  );
}

function AcoesDaLinha({ acoes }: Readonly<{ acoes: AcaoLinha[] }>) {
  const permissoes = usePermissoes();
  const permitidas = acoes.filter((acao) => !acao.permissao || permissoes.includes(acao.permissao));
  if (permitidas.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Ações">
          <MoreHorizontalIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {permitidas.map(({ rotulo, onSelect, icone: Icone, destrutiva, desabilitada }) => (
          <DropdownMenuItem
            key={rotulo}
            variant={destrutiva ? 'destructive' : 'default'}
            disabled={desabilitada}
            onSelect={onSelect}
          >
            {Icone && <Icone aria-hidden />}
            {rotulo}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
