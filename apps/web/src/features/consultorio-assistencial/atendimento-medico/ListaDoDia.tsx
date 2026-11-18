import {
  ATENDIMENTO_MEDICO_PAGE_SIZE,
  ATENDIMENTO_MEDICO_STATUS_FILTRO,
  ATENDIMENTO_MEDICO_STATUS_FILTRO_ROTULOS,
  atendimentoMedicoPageSchema,
  podeAtender,
  type AtendimentoMedicoItem,
} from '@torres/shared';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, StethoscopeIcon } from 'lucide-react';
import { useMemo } from 'react';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarData } from '@/lib/formatar';
import { horaLocal, somarDias } from '@/features/comercial-atendimento/agenda/agenda-datas';
import { hojeISO } from '@/lib/datas';
import { StatusAgendamento, StatusPagamento } from './StatusAgendamento';
import { URL_ATENDIMENTO_MEDICO, useIniciarAtendimento } from './use-atendimento-medico';

const FILTROS: readonly FiltroGrid[] = [
  {
    tipo: 'entidade',
    parametro: 'profissionalId',
    rotulo: 'Profissional',
    entidade: 'profissionais',
    rotuloTodos: 'Todos os profissionais',
  },
  {
    tipo: 'select',
    parametro: 'status',
    rotulo: 'Status',
    rotuloTodos: 'Todos os status',
    opcoes: ATENDIMENTO_MEDICO_STATUS_FILTRO.map((status) => ({
      valor: status,
      rotulo: ATENDIMENTO_MEDICO_STATUS_FILTRO_ROTULOS[status],
    })),
  },
];

/** Só precisa iniciar quem ainda não está em atendimento nem foi atendido. */
function precisaIniciar(linha: AtendimentoMedicoItem): boolean {
  return linha.status !== 'EM_ATENDIMENTO' && linha.status !== 'ATENDIDO';
}

export interface ListaDoDiaProps {
  data: string;
  onData: (data: string) => void;
  onAbrir: (agendamentoId: string) => void;
}

/** Barra de data (‹ dia ›, Hoje) e o grid dos agendamentos do dia. */
export function ListaDoDia({ data, onData, onAbrir }: Readonly<ListaDoDiaProps>) {
  const podeIniciar = usePermissao('consultorio-assistencial.atendimento-medico.criar');
  const { mutate: iniciar, isPending: iniciando } = useIniciarAtendimento();

  const colunas = useMemo((): ColunaGrid<AtendimentoMedicoItem>[] => {
    const atender = (linha: AtendimentoMedicoItem) => {
      if (!precisaIniciar(linha)) {
        onAbrir(linha.id);
        return;
      }
      iniciar(linha.id, { onSuccess: () => onAbrir(linha.id) });
    };
    return [
      {
        id: 'inicio',
        titulo: 'Hora',
        ordenavel: true,
        celula: (linha) => <span className="font-semibold">{horaLocal(linha.inicio)}</span>,
      },
      {
        id: 'pacienteNome',
        titulo: 'Paciente',
        ordenavel: 'paciente',
        celula: (linha) => <span className="font-medium">{linha.pacienteNome}</span>,
      },
      { id: 'profissionalNome', titulo: 'Profissional', ordenavel: 'profissional' },
      { id: 'procedimento', titulo: 'Procedimento' },
      {
        id: 'status',
        titulo: 'Status',
        celula: (linha) => <StatusAgendamento status={linha.status} />,
      },
      {
        id: 'pago',
        titulo: 'Pgto',
        celula: (linha) => <StatusPagamento pago={linha.pago} status={linha.status} />,
      },
      {
        id: 'atender',
        titulo: 'Ações',
        ocultavel: false,
        className: 'text-right',
        celula: (linha) =>
          (podeIniciar || !precisaIniciar(linha)) && (
            <Button
              size="sm"
              disabled={!podeAtender(linha.status) || iniciando}
              onClick={() => atender(linha)}
              aria-label={`Atender ${linha.pacienteNome}`}
            >
              <StethoscopeIcon aria-hidden />
              Atender
            </Button>
          ),
      },
    ];
  }, [iniciar, iniciando, onAbrir, podeIniciar]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Dia">
        <Button
          variant="outline"
          size="icon"
          aria-label="Dia anterior"
          onClick={() => onData(somarDias(data, -1))}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <Input
          type="date"
          aria-label="Data"
          className="w-44"
          value={data}
          onChange={(evento) => evento.target.value && onData(evento.target.value)}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Próximo dia"
          onClick={() => onData(somarDias(data, 1))}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onData(hojeISO())}>
          Hoje
        </Button>
      </div>

      <DataGrid
        url={URL_ATENDIMENTO_MEDICO}
        schema={atendimentoMedicoPageSchema}
        colunas={colunas}
        consultaFixa={{ data }}
        busca={false}
        filtros={FILTROS}
        tamanhosPagina={[ATENDIMENTO_MEDICO_PAGE_SIZE]}
        aoClicarLinha={(linha) => onAbrir(linha.id)}
        mensagemVazio="Nenhum atendimento para este dia."
        resumo={(meta) => (
          <span className="flex items-center gap-1.5">
            <CalendarIcon aria-hidden className="size-4" />
            {formatarData(data)} - <strong className="text-foreground">{meta.total}</strong>{' '}
            atendimento(s)
          </span>
        )}
      />
    </div>
  );
}
