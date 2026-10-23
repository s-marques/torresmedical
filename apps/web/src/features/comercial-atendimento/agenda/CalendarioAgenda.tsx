import { AGENDAMENTO_STATUS_ROTULOS, type Agendamento } from '@torres/shared';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  faixaDeHoras,
  formatarHora,
  horaLocal,
  minutosDoDia,
  posicionar,
  type VisaoAgenda,
} from './agenda-datas';
import { COR_STATUS } from './agenda-status';
import type { ColunaCalendario } from './colunas-agenda';

/** Altura de uma hora na grade, em px. */
const ALTURA_HORA = 64;
const ALTURA_MINIMA_CARTAO = 22;

export interface CalendarioAgendaProps {
  visao: VisaoAgenda;
  colunas: readonly ColunaCalendario[];
  onSelecionar: (agendamento: Agendamento) => void;
}

/** Grade de horas com os agendamentos posicionados pelo horário e pela duração. */
export function CalendarioAgenda({
  visao,
  colunas,
  onSelecionar,
}: Readonly<CalendarioAgendaProps>) {
  const todos = colunas.flatMap((c) => c.agendamentos);
  const [primeira, ultima] = faixaDeHoras(todos);
  const horas = Array.from({ length: ultima - primeira + 1 }, (_, i) => primeira + i);
  const minutosIniciais = primeira * 60;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `4rem repeat(${Math.max(colunas.length, 1)}, minmax(${visao === 'dia' ? '11rem' : '7.5rem'}, 1fr))`,
        }}
      >
        <div className="border-b" />
        {colunas.map((coluna) => (
          <div
            key={coluna.chave}
            className={cn(
              'flex flex-col items-center gap-0.5 border-b border-l p-1',
              coluna.destaque && 'bg-primary/10 text-primary',
            )}
          >
            {coluna.cabecalho}
          </div>
        ))}

        <div>
          {horas.map((hora) => (
            <div
              key={hora}
              className="text-muted-foreground border-b pt-1 pr-2 text-right text-xs"
              style={{ height: ALTURA_HORA }}
            >
              {formatarHora(hora * 60)}
            </div>
          ))}
        </div>
        {colunas.map((coluna) => (
          <div
            key={coluna.chave}
            data-testid={`coluna-${coluna.chave}`}
            className={cn('relative border-l', coluna.destaque && 'bg-primary/5')}
            style={{ height: horas.length * ALTURA_HORA }}
          >
            {horas.map((hora) => (
              <div key={hora} className="border-b" style={{ height: ALTURA_HORA }} />
            ))}
            {posicionar(coluna.agendamentos).map(({ agendamento, faixa, faixas }) => (
              <CartaoAgendamento
                key={agendamento.id}
                agendamento={agendamento}
                topo={((minutosDoDia(agendamento.inicio) - minutosIniciais) / 60) * ALTURA_HORA}
                faixa={faixa}
                faixas={faixas}
                onSelecionar={onSelecionar}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface CartaoProps {
  agendamento: Agendamento;
  topo: number;
  faixa: number;
  faixas: number;
  onSelecionar: (agendamento: Agendamento) => void;
}

function CartaoAgendamento({
  agendamento: a,
  topo,
  faixa,
  faixas,
  onSelecionar,
}: Readonly<CartaoProps>) {
  const fim = minutosDoDia(a.inicio) + a.duracaoMinutos;
  const altura = Math.max((a.duracaoMinutos / 60) * ALTURA_HORA - 2, ALTURA_MINIMA_CARTAO);
  const largura = 100 / faixas;
  return (
    <button
      type="button"
      onClick={() => onSelecionar(a)}
      aria-label={`Agendamento ${a.numero}: ${a.pacienteNome}, ${horaLocal(a.inicio)}, ${AGENDAMENTO_STATUS_ROTULOS[a.status]}`}
      className={cn(
        'absolute overflow-hidden rounded px-1.5 py-1 text-left text-xs leading-tight text-white shadow-sm',
        'focus-visible:ring-ring cursor-pointer outline-none hover:brightness-110 focus-visible:ring-2',
        COR_STATUS[a.status].fundo,
      )}
      style={{
        top: topo + 1,
        height: altura,
        left: `${faixa * largura}%`,
        width: `calc(${largura}% - 2px)`,
      }}
    >
      <span className="flex items-center gap-1 font-semibold">
        {horaLocal(a.inicio)}-{formatarHora(fim % 1440)}
        {a.status === 'CONFIRMADO' && <CheckIcon aria-hidden className="size-3" />}
        {a.valor ? <span className="ml-auto opacity-70">R$ {a.valor}</span> : null}
      </span>
      <span className="block truncate font-semibold">{a.pacienteNome}</span>
      <span className="block truncate opacity-80">
        {[a.tipoNome, a.profissionalNome.split(' ')[0]].filter(Boolean).join(' • ')} •{' '}
        {a.duracaoMinutos}min
      </span>
    </button>
  );
}
