import {
  adicionarDias,
  DIAS_SEMANA,
  abreviarDiaSemana,
  diaDaSemana,
  SALA_BLOQUEIO_TIPOS,
  segundaDaSemana,
  type SalaOcupacaoBloco,
  type SalaOcupacaoBloqueio,
} from '@torres/shared';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { hojeISO } from '@/lib/datas';
import { formatarData } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { COR_BLOQUEIO, COR_CONTRATO } from './cores-bloqueio';
import { useOcupacaoSemana } from './use-salas-painel';

const DIAS = [0, 1, 2, 3, 4, 5, 6] as const;

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

function Bloco({ bloco }: Readonly<{ bloco: SalaOcupacaoBloco }>) {
  return (
    <li className={cn('rounded-md px-2 py-1 text-xs', COR_CONTRATO)}>
      <span className="block">{bloco.locatarioNome}</span>
      <span className="block">
        {bloco.inicio}-{bloco.fim}
      </span>
    </li>
  );
}

/** Dia de bloqueio ou reserva da sala (issue #138), com a cor do tipo. */
function Bloqueio({ bloqueio }: Readonly<{ bloqueio: SalaOcupacaoBloqueio }>) {
  const { t } = useTranslation();
  const diaInteiro = bloqueio.inicio === '00:00' && bloqueio.fim === '24:00';
  const quem = bloqueio.oculto ? t('salasBloqueios.ocupado') : bloqueio.profissionalNome;
  return (
    <li className={cn('rounded-md px-2 py-1 text-xs', COR_BLOQUEIO[bloqueio.tipo])}>
      <span className="block font-medium">{t(`salasBloqueios.tipos.${bloqueio.tipo}`)}</span>
      {quem && <span className="block">{quem}</span>}
      <span className="block">
        {diaInteiro ? t('salasBloqueios.diaInteiro') : `${bloqueio.inicio}-${bloqueio.fim}`}
      </span>
    </li>
  );
}

/** Legenda das cores: período contratado e cada tipo de bloqueio. */
function Legenda() {
  const { t } = useTranslation();
  const itens = [
    { chave: 'contrato', rotulo: t('salasBloqueios.mapa.contratado'), cor: COR_CONTRATO },
    ...SALA_BLOQUEIO_TIPOS.map((tipo) => ({
      chave: tipo,
      rotulo: t(`salasBloqueios.tipos.${tipo}`),
      cor: COR_BLOQUEIO[tipo],
    })),
  ];
  return (
    <ul aria-label={t('salasBloqueios.mapa.legenda')} className="flex flex-wrap gap-2 text-xs">
      {itens.map((item) => (
        <li key={item.chave} className={cn('rounded-md px-2 py-0.5', item.cor)}>
          {item.rotulo}
        </li>
      ))}
    </ul>
  );
}

/**
 * Aba Mapa Ocupação: semana de segunda a domingo com os contratos ativos de cada sala e os
 * bloqueios e reservas ativos (issue #138), só para visualização.
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
      <Legenda />
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
                    const bloqueios = sala.bloqueios.filter((b) => b.data === data);
                    return (
                      <td key={data} className="border-r p-1 last:border-r-0">
                        {blocos.length + bloqueios.length > 0 && (
                          <ul
                            className="grid gap-1"
                            aria-label={`${sala.salaNome}, ${formatarData(data)}`}
                          >
                            {blocos.map((bloco) => (
                              <Bloco key={`${bloco.contratoId}-${bloco.inicio}`} bloco={bloco} />
                            ))}
                            {bloqueios.map((bloqueio) => (
                              <Bloqueio
                                key={`${bloqueio.bloqueioId}-${bloqueio.inicio}`}
                                bloqueio={bloqueio}
                              />
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
