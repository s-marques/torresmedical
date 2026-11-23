import {
  abreviarDiaSemana,
  deslocarMatriz,
  diaDaSemana,
  MATRIZ_STATUS,
  MATRIZ_VISOES,
  type AgendaMatriz,
  type AgendaMatrizCelula,
  type AgendaMatrizColuna,
} from '@torres/shared';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { hojeISO } from '@/lib/datas';
import { formatarData } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { ModalCelulaMatriz, type CelulaSelecionada } from './ModalCelulaMatriz';
import { ModalNovoAgendamento } from './ModalNovoAgendamento';
import { COR_MATRIZ, DESTAQUE_SEM_USO } from './matriz-cores';
import {
  gravarFiltrosMatriz,
  lerFiltrosMatriz,
  SITUACOES,
  TURNOS,
  type ChaveFiltroMatriz,
} from './matriz-filtros';
import { rotuloStatusMatriz } from './matriz-rotulos';
import { useAgendaMatriz } from './use-agenda-matriz';

const TODOS = 'todos';

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** Título do período: o dia ou "início - fim". */
function tituloDoPeriodo(m: Pick<AgendaMatriz, 'inicio' | 'fim' | 'visao'>): string {
  return m.visao === 'dia'
    ? formatarData(m.inicio)
    : `${formatarData(m.inicio)} - ${formatarData(m.fim)}`;
}

interface CelulaBotaoProps {
  celula: AgendaMatrizCelula | undefined;
  descricao: string;
  compacta: boolean;
  rotuloCurto: string;
  onClick: () => void;
}

function CelulaBotao({
  celula,
  descricao,
  compacta,
  rotuloCurto,
  onClick,
}: Readonly<CelulaBotaoProps>) {
  const { t } = useTranslation();
  if (!celula) {
    return (
      <span
        aria-hidden
        className={cn('block rounded-md', compacta ? 'h-7 flex-1' : 'h-10 w-full')}
      />
    );
  }
  const primeiro = celula.itens[0];
  const nome = primeiro?.oculto ? t('salasBloqueios.ocupado') : (primeiro?.nome ?? '');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={descricao}
      title={descricao}
      className={cn(
        'focus-visible:ring-ring block overflow-hidden rounded-md px-1 text-left text-xs focus-visible:ring-2 focus-visible:outline-none',
        compacta ? 'h-7 flex-1 text-center font-medium' : 'h-10 w-full',
        COR_MATRIZ[celula.status],
        celula.semUso && DESTAQUE_SEM_USO,
      )}
    >
      {compacta ? rotuloCurto : <span className="block truncate">{nome}</span>}
    </button>
  );
}

/** Legenda das cores, mais o destaque do período contratado sem uso. */
function Legenda() {
  const { t } = useTranslation();
  return (
    <ul aria-label={t('agenda.matriz.legenda')} className="flex flex-wrap gap-2 text-xs">
      {MATRIZ_STATUS.map((status) => (
        <li key={status} className={cn('rounded-md px-2 py-0.5', COR_MATRIZ[status])}>
          {rotuloStatusMatriz(t, status)}
        </li>
      ))}
      <li className={cn('bg-muted/40 rounded-md px-2 py-0.5', DESTAQUE_SEM_USO)}>
        {t('agenda.matriz.semUso')}
      </li>
    </ul>
  );
}

function Grade({
  matriz,
  onSelecionar,
}: Readonly<{ matriz: AgendaMatriz; onSelecionar: (s: CelulaSelecionada) => void }>) {
  const { t } = useTranslation();
  const porHora = matriz.visao === 'dia';
  const indice = useMemo(() => {
    const mapa = new Map<string, AgendaMatrizCelula>();
    for (const sala of matriz.salas) {
      for (const c of sala.celulas) mapa.set(`${sala.salaId}|${c.data}|${c.coluna}`, c);
    }
    return mapa;
  }, [matriz]);

  const rotuloColuna = (coluna: AgendaMatrizColuna) =>
    porHora ? coluna.chave : t(`agenda.matriz.turnos.${coluna.turno}`);
  const descrever = (
    sala: string,
    data: string,
    coluna: AgendaMatrizColuna,
    c: AgendaMatrizCelula | undefined,
  ) => {
    const estado = rotuloStatusMatriz(t, c?.status ?? 'DISPONIVEL');
    const aviso = c?.semUso ? `, ${t('agenda.matriz.semUso')}` : '';
    return `${sala}, ${formatarData(data)}, ${rotuloColuna(coluna)}: ${estado}${aviso}`;
  };

  /** Botão de uma célula; o mesmo para as duas orientações da grade. */
  const botao = (
    sala: { salaId: string; salaNome: string },
    data: string,
    coluna: AgendaMatrizColuna,
  ) => {
    const celula = indice.get(`${sala.salaId}|${data}|${coluna.chave}`);
    return (
      <CelulaBotao
        key={coluna.chave}
        celula={celula}
        descricao={descrever(sala.salaNome, data, coluna, celula)}
        compacta={!porHora}
        rotuloCurto={t(`agenda.matriz.turnosCurto.${coluna.turno}`)}
        onClick={() => onSelecionar({ ...sala, data, coluna, celula })}
      />
    );
  };

  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <table
        className={cn(
          'w-full border-collapse text-sm',
          porHora ? 'min-w-[56rem]' : 'min-w-[48rem]',
        )}
      >
        <thead>
          <tr className="bg-muted/50">
            <th scope="col" className="w-28 border-r px-3 py-2 text-left font-semibold">
              {t('agenda.campos.sala')}
            </th>
            {porHora
              ? matriz.colunas.map((coluna) => (
                  <th
                    key={coluna.chave}
                    scope="col"
                    className="border-r px-1 py-2 text-center text-xs"
                  >
                    {coluna.chave}
                  </th>
                ))
              : matriz.dias.map((data) => (
                  <th key={data} scope="col" className="border-r px-1 py-2 text-center">
                    <span className="block font-semibold">
                      {abreviarDiaSemana(diaDaSemana(data))}
                    </span>
                    <span className="text-muted-foreground block text-xs font-normal">
                      {diaMes(data)}
                    </span>
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {matriz.salas.map((sala) => (
            <tr key={sala.salaId} className="border-t align-top">
              <th scope="row" className="border-r px-3 py-2 text-left font-medium">
                {sala.salaNome}
              </th>
              {porHora
                ? matriz.colunas.map((coluna) => (
                    <td key={coluna.chave} className="border-r p-0.5">
                      {botao(sala, matriz.inicio, coluna)}
                    </td>
                  ))
                : matriz.dias.map((data) => (
                    <td key={data} className="border-r p-0.5">
                      <div className="flex gap-0.5">
                        {matriz.colunas.map((coluna) => botao(sala, data, coluna))}
                      </div>
                    </td>
                  ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Alteracoes = Partial<Record<ChaveFiltroMatriz, string | null>>;

/**
 * Visão Matriz da Agenda (issue #137): Sala × Dia × Horário × Profissional. O estado fica na
 * URL: `visao`, `data`, `profissionalId`, `especialidadeId`, `salaId`, `turno` e `situacao`.
 */
export function MatrizAgenda() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [hoje] = useState(() => hojeISO());
  const filtros = lerFiltrosMatriz(params);
  const visao = filtros.visao ?? 'semana';
  const data = filtros.data ?? hoje;
  const consulta = useAgendaMatriz({ ...filtros, visao, data });
  const [selecionada, setSelecionada] = useState<CelulaSelecionada | null>(null);
  const [agendando, setAgendando] = useState<{ salaId: string; data: string; hora: string } | null>(
    null,
  );

  const alterar = (alteracoes: Alteracoes) =>
    setParams(gravarFiltrosMatriz(params, alteracoes), { replace: true });
  const deslocar = (sentido: -1 | 1) => alterar({ data: deslocarMatriz(visao, data, sentido) });
  const matriz = consulta.data;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('agenda.matriz.anterior')}
            onClick={() => deslocar(-1)}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button type="button" variant="outline" onClick={() => alterar({ data: null })}>
            {t('agenda.matriz.hoje')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('agenda.matriz.proximo')}
            onClick={() => deslocar(1)}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          {matriz && (
            <h2 className="ml-1 font-semibold" aria-live="polite">
              {tituloDoPeriodo(matriz)}
            </h2>
          )}
        </div>
        <div
          role="group"
          aria-label={t('agenda.matriz.visaoRotulo')}
          className="bg-muted flex rounded-lg p-1"
        >
          {MATRIZ_VISOES.map((opcao) => (
            <Button
              key={opcao}
              type="button"
              size="sm"
              variant={visao === opcao ? 'outline' : 'ghost'}
              aria-pressed={visao === opcao}
              onClick={() => alterar({ visao: opcao })}
            >
              {t(`agenda.matriz.visoes.${opcao}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EntitySelect
          entidade="profissionais"
          value={filtros.profissionalId ?? null}
          onChange={(id) => alterar({ profissionalId: id })}
          placeholder={t('agenda.matriz.filtros.profissional')}
          aria-label={t('agenda.matriz.filtros.profissional')}
          className="w-56"
        />
        <EntitySelect
          entidade="especialidades"
          value={filtros.especialidadeId ?? null}
          onChange={(id) => alterar({ especialidadeId: id })}
          placeholder={t('agenda.matriz.filtros.especialidade')}
          aria-label={t('agenda.matriz.filtros.especialidade')}
          className="w-52"
        />
        <EntitySelect
          entidade="salas"
          value={filtros.salaId ?? null}
          onChange={(id) => alterar({ salaId: id })}
          placeholder={t('agenda.matriz.filtros.sala')}
          aria-label={t('agenda.matriz.filtros.sala')}
          className="w-44"
        />
        <Select
          value={filtros.turno ?? TODOS}
          onValueChange={(v) => alterar({ turno: v === TODOS ? null : v })}
        >
          <SelectTrigger aria-label={t('agenda.matriz.filtros.turno')} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t('agenda.matriz.filtros.todosTurnos')}</SelectItem>
            {TURNOS.map((turno) => (
              <SelectItem key={turno} value={turno}>
                {t(`agenda.matriz.turnos.${turno}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filtros.situacao ?? TODOS}
          onValueChange={(v) => alterar({ situacao: v === TODOS ? null : v })}
        >
          <SelectTrigger aria-label={t('agenda.matriz.filtros.situacao')} className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t('agenda.matriz.filtros.todasSituacoes')}</SelectItem>
            {SITUACOES.map((situacao) => (
              <SelectItem key={situacao} value={situacao}>
                {t(`agenda.matriz.situacoes.${situacao}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Legenda />

      {consulta.isPending && <Skeleton className="h-64 rounded-xl" aria-busy />}
      {consulta.isError && (
        <EmptyState
          titulo={t('agenda.matriz.erro')}
          acao={
            <Button type="button" variant="outline" onClick={() => void consulta.refetch()}>
              {t('agenda.matriz.tentarDeNovo')}
            </Button>
          }
        />
      )}
      {matriz?.salas.length === 0 && <EmptyState titulo={t('agenda.matriz.vazio')} />}
      {matriz && matriz.salas.length > 0 && <Grade matriz={matriz} onSelecionar={setSelecionada} />}

      {selecionada && (
        <ModalCelulaMatriz
          selecionada={selecionada}
          onFechar={() => setSelecionada(null)}
          onAgendar={(salaId, dia, hora) => {
            setSelecionada(null);
            setAgendando({ salaId, data: dia, hora });
          }}
        />
      )}
      {agendando && (
        <ModalNovoAgendamento
          data={agendando.data}
          hora={agendando.hora}
          salaId={agendando.salaId}
          onFechar={() => setAgendando(null)}
        />
      )}
    </div>
  );
}
