import {
  AGENDAMENTO_STATUS_LEGENDA,
  AGENDAMENTO_STATUS_ROTULOS,
  PROFISSIONAL_CORES,
  type Agendamento,
} from '@torres/shared';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { hojeISO } from '@/lib/datas';
import { cn } from '@/lib/utils';
import {
  diasDoPeriodo,
  periodoDaVisao,
  somarDias,
  tituloDoPeriodo,
  type VisaoAgenda,
} from './agenda-datas';
import { COR_STATUS } from './agenda-status';
import { MatrizAgenda } from './MatrizAgenda';
import { MODO_MATRIZ } from './matriz-filtros';
import { CalendarioAgenda } from './CalendarioAgenda';
import { colunasDaSemana, colunasDoDia } from './colunas-agenda';
import { ModalCancelarAgendamento } from './ModalCancelarAgendamento';
import { ModalDetalheAgendamento } from './ModalDetalheAgendamento';
import { ModalEditarAgendamento } from './ModalEditarAgendamento';
import { ModalNovoAgendamento } from './ModalNovoAgendamento';
import { useAgendamentos, useProfissionaisAgenda } from './use-agenda';

const TODOS = 'todos';

/** Calendário semanal ou diário dos agendamentos, com filtro de profissional e detalhe. */
function AgendaCalendario({ seletor }: Readonly<{ seletor: ReactNode }>) {
  const [hoje] = useState(() => hojeISO());
  const [dataBase, setDataBase] = useState(hoje);
  // No celular a semana de 7 colunas não cabe: a visão inicial é o dia (issue #161).
  const celular = useIsMobile();
  const [visao, setVisao] = useState<VisaoAgenda>(celular ? 'dia' : 'semana');
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [selecionado, setSelecionado] = useState<Agendamento | null>(null);
  const [editando, setEditando] = useState<Agendamento | null>(null);
  const [cancelando, setCancelando] = useState<Agendamento | null>(null);

  const periodo = periodoDaVisao(dataBase, visao);
  const agendamentos = useAgendamentos(periodo, profissionalId);
  const profissionais = useProfissionaisAgenda();

  const passo = visao === 'dia' ? 1 : 7;
  const lista = useMemo(() => agendamentos.data ?? [], [agendamentos.data]);
  const colunas = useMemo(() => {
    if (visao === 'semana') return colunasDaSemana(diasDoPeriodo(periodo), lista, hoje);
    const doFiltro = (profissionais.data ?? []).filter(
      (p) => profissionalId === null || p.id === profissionalId,
    );
    return colunasDoDia(periodo.inicio, doFiltro, lista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visao, periodo.inicio, periodo.fim, lista, profissionais.data, profissionalId, hoje]);

  const carregando = agendamentos.isPending || (visao === 'dia' && profissionais.isPending);

  return (
    <div className="grid gap-4">
      <PageHeader
        titulo="Agenda"
        descricao="Gerencie os agendamentos da clínica."
        acoes={
          <SePermitido permissao="comercial-atendimento.agenda.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Agendamento
            </Button>
          </SePermitido>
        }
      />

      {seletor}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Anterior"
            onClick={() => setDataBase(somarDias(dataBase, -passo))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button type="button" variant="outline" onClick={() => setDataBase(hoje)}>
            Hoje
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo"
            onClick={() => setDataBase(somarDias(dataBase, passo))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
          <h2 className="ml-1 font-semibold" aria-live="polite">
            {tituloDoPeriodo(periodo, visao)}
          </h2>
        </div>
        <div role="group" aria-label="Visão" className="bg-muted flex rounded-lg p-1">
          {(['semana', 'dia'] as const).map((opcao) => (
            <Button
              key={opcao}
              type="button"
              size="sm"
              variant={visao === opcao ? 'outline' : 'ghost'}
              aria-pressed={visao === opcao}
              onClick={() => setVisao(opcao)}
            >
              {opcao === 'semana' ? 'Semana' : 'Dia'}
            </Button>
          ))}
        </div>
      </div>

      {visao === 'semana' ? (
        <Select
          value={profissionalId ?? TODOS}
          onValueChange={(valor) => setProfissionalId(valor === TODOS ? null : valor)}
        >
          <SelectTrigger aria-label="Profissional" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos profissionais</SelectItem>
            {(profissionais.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div role="group" aria-label="Profissional" className="flex flex-wrap gap-2">
          <ChipProfissional ativo={profissionalId === null} onClick={() => setProfissionalId(null)}>
            Todos
          </ChipProfissional>
          {(profissionais.data ?? []).map((p) => (
            <ChipProfissional
              key={p.id}
              ativo={profissionalId === p.id}
              cor={PROFISSIONAL_CORES[p.cor].hex}
              onClick={() => setProfissionalId(p.id)}
            >
              {p.nome}
            </ChipProfissional>
          ))}
        </div>
      )}

      {agendamentos.isError ? (
        <EmptyState
          titulo="Não foi possível carregar a agenda."
          acao={
            <Button type="button" variant="outline" onClick={() => void agendamentos.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : carregando ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <CalendarioAgenda visao={visao} colunas={colunas} onSelecionar={setSelecionado} />
      )}

      <Legenda agendamentos={lista} />

      {criando && (
        <ModalNovoAgendamento
          data={visao === 'dia' ? dataBase : undefined}
          onFechar={() => setCriando(false)}
        />
      )}
      {selecionado && (
        <ModalDetalheAgendamento
          agendamento={selecionado}
          onFechar={() => setSelecionado(null)}
          onEditar={(agendamento) => {
            setSelecionado(null);
            setEditando(agendamento);
          }}
          onCancelar={(agendamento) => {
            setSelecionado(null);
            setCancelando(agendamento);
          }}
        />
      )}
      {cancelando && (
        <ModalCancelarAgendamento
          agendamento={cancelando}
          agendamentos={lista}
          onFechar={() => setCancelando(null)}
        />
      )}
      {editando && (
        <ModalEditarAgendamento agendamento={editando} onFechar={() => setEditando(null)} />
      )}
    </div>
  );
}

/**
 * Agenda (`/agenda`, docs/inventario/telas/comercial-atendimento-agenda.md): o calendário dos
 * agendamentos e a visão Matriz Sala × Dia × Horário × Profissional (issue #137, `?modo=matriz`).
 */
export default function AgendaPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const matriz = params.get('modo') === MODO_MATRIZ;
  const abrir = (destino: boolean) => {
    if (destino === matriz) return;
    setParams(destino ? new URLSearchParams({ modo: MODO_MATRIZ }) : new URLSearchParams(), {
      replace: true,
    });
  };
  const seletor = (
    <div
      role="group"
      aria-label={t('agenda.matriz.modoRotulo')}
      className="bg-muted flex w-fit rounded-lg p-1"
    >
      {([false, true] as const).map((opcao) => (
        <Button
          key={String(opcao)}
          type="button"
          size="sm"
          variant={matriz === opcao ? 'outline' : 'ghost'}
          aria-pressed={matriz === opcao}
          onClick={() => abrir(opcao)}
        >
          {t(opcao ? 'agenda.matriz.modoMatriz' : 'agenda.matriz.modoCalendario')}
        </Button>
      ))}
    </div>
  );
  if (!matriz) return <AgendaCalendario seletor={seletor} />;
  return (
    <div className="grid gap-4">
      <PageHeader titulo="Agenda" descricao="Gerencie os agendamentos da clínica." />
      {seletor}
      <MatrizAgenda />
    </div>
  );
}

function ChipProfissional({
  ativo,
  cor,
  onClick,
  children,
}: Readonly<{ ativo: boolean; cor?: string; onClick: () => void; children: string }>) {
  return (
    <Button
      type="button"
      size="sm"
      variant={ativo ? 'default' : 'outline'}
      aria-pressed={ativo}
      onClick={onClick}
      className="uppercase"
    >
      {cor && <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: cor }} />}
      {children}
    </Button>
  );
}

/** Rodapé: quantos agendamentos do período há em cada status. */
function Legenda({ agendamentos }: Readonly<{ agendamentos: readonly Agendamento[] }>) {
  return (
    <ul
      className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
      aria-label="Legenda"
    >
      {AGENDAMENTO_STATUS_LEGENDA.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-full', COR_STATUS[status].ponto)} />
          {AGENDAMENTO_STATUS_ROTULOS[status]}:{' '}
          {agendamentos.filter((a) => a.status === status).length}
        </li>
      ))}
    </ul>
  );
}
