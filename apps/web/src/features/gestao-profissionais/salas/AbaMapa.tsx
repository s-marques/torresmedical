import {
  adicionarDias,
  DIAS_SEMANA,
  abreviarDiaSemana,
  diaDaSemana,
  segundaDaSemana,
  type SalaOcupacaoBloco,
} from '@torres/shared';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { hojeISO } from '@/lib/datas';
import { formatarData } from '@/lib/formatar';
import { useOcupacaoSemana } from './use-salas-painel';

const DIAS = [0, 1, 2, 3, 4, 5, 6] as const;

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

function Bloco({ bloco }: Readonly<{ bloco: SalaOcupacaoBloco }>) {
  return (
    <li className="rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-800">
      <span className="block">{bloco.locatarioNome}</span>
      <span className="block">
        {bloco.inicio}-{bloco.fim}
      </span>
    </li>
  );
}

/**
 * Aba Mapa Ocupação: semana de segunda a domingo com os contratos ativos de cada sala, só
 * para visualização.
 */
export function AbaMapa() {
  const [segunda, setSegunda] = useState(() => segundaDaSemana(hojeISO()));
  const mapa = useOcupacaoSemana(segunda);
  const dados = mapa.data;
  const dias = DIAS.map((i) => adicionarDias(segunda, i));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Semana anterior"
          onClick={() => setSegunda(adicionarDias(segunda, -7))}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {formatarData(segunda)} - {formatarData(adicionarDias(segunda, 6))}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Próxima semana"
          onClick={() => setSegunda(adicionarDias(segunda, 7))}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSegunda(segundaDaSemana(hojeISO()))}
        >
          Hoje
        </Button>
      </div>
      {mapa.isPending && <Skeleton className="h-64 rounded-xl" aria-busy />}
      {mapa.isError && (
        <EmptyState
          titulo="Não foi possível carregar o mapa de ocupação."
          acao={
            <Button type="button" variant="outline" onClick={() => void mapa.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {dados?.salas.length === 0 && <EmptyState titulo="Nenhuma sala cadastrada." />}
      {dados && dados.salas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="w-28 border-r px-3 py-2 text-left font-semibold">
                  Sala
                </th>
                {dias.map((data) => (
                  <th
                    key={data}
                    scope="col"
                    className="border-r px-2 py-2 text-center last:border-r-0"
                  >
                    <span className="block font-semibold">
                      {abreviarDiaSemana(diaDaSemana(data))}
                    </span>
                    <span
                      className="block text-xs font-normal text-muted-foreground"
                      title={DIAS_SEMANA[diaDaSemana(data)]}
                    >
                      {diaMes(data)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.salas.map((sala) => (
                <tr key={sala.salaId} className="border-t align-top">
                  <th scope="row" className="border-r px-3 py-3 text-left font-medium">
                    {sala.salaNome}
                  </th>
                  {dias.map((data) => {
                    const blocos = sala.blocos.filter((b) => b.data === data);
                    return (
                      <td key={data} className="border-r p-1 last:border-r-0">
                        {blocos.length > 0 && (
                          <ul
                            className="grid gap-1"
                            aria-label={`${sala.salaNome}, ${formatarData(data)}`}
                          >
                            {blocos.map((bloco) => (
                              <Bloco key={`${bloco.contratoId}-${bloco.inicio}`} bloco={bloco} />
                            ))}
                          </ul>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
