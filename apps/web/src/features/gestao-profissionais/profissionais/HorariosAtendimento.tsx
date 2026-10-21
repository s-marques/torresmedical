import {
  DIAS_SEMANA,
  salvarHorariosSchema,
  type HorarioAtendimento,
  type HorarioAtendimentoInput,
  type HorarioTipo,
} from '@torres/shared';
import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useHorarios, useSalvarHorarios } from './use-profissionais';

interface Linha {
  chave: string;
  tipo: HorarioTipo;
  /** Valor do select do dia da semana (`''` = não escolhido). */
  diaSemana: string;
  data: string;
  inicio: string;
  fim: string;
  almocoInicio: string;
  almocoFim: string;
}

let sequencia = 0;
function novaChave(): string {
  sequencia += 1;
  return `linha-${sequencia}`;
}

function novaLinha(tipo: HorarioTipo): Linha {
  return {
    chave: novaChave(),
    tipo,
    diaSemana: '',
    data: '',
    inicio: '',
    fim: '',
    almocoInicio: '',
    almocoFim: '',
  };
}

function paraEntrada(linha: Linha): HorarioAtendimentoInput {
  return {
    tipo: linha.tipo,
    diaSemana: linha.tipo === 'SEMANAL' && linha.diaSemana !== '' ? Number(linha.diaSemana) : null,
    data: linha.tipo === 'POR_DATA' ? linha.data : null,
    inicio: linha.inicio,
    fim: linha.fim,
    almocoInicio: linha.almocoInicio,
    almocoFim: linha.almocoFim,
  };
}

const ABAS: { tipo: HorarioTipo; rotulo: string }[] = [
  { tipo: 'SEMANAL', rotulo: 'Semanal' },
  { tipo: 'POR_DATA', rotulo: 'Por Data' },
];

function linhasIniciais(horarios: HorarioAtendimento[]): Linha[] {
  return horarios.map((h) => ({
    chave: h.id,
    tipo: h.tipo,
    diaSemana: h.diaSemana === null ? '' : String(h.diaSemana),
    data: h.data ?? '',
    inicio: h.inicio,
    fim: h.fim,
    almocoInicio: h.almocoInicio ?? '',
    almocoFim: h.almocoFim ?? '',
  }));
}

/** Seção "Horários de Atendimento" do modal Editar: salva a lista inteira em "Salvar Horários". */
export function HorariosAtendimento({ profissionalId }: Readonly<{ profissionalId: string }>) {
  const horarios = useHorarios(profissionalId);
  if (horarios.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Não foi possível carregar os horários de atendimento.
      </p>
    );
  }
  if (!horarios.data) {
    return <p className="text-sm text-muted-foreground">Carregando horários…</p>;
  }
  return (
    <EditorHorarios profissionalId={profissionalId} inicial={linhasIniciais(horarios.data.data)} />
  );
}

interface EditorHorariosProps {
  profissionalId: string;
  inicial: Linha[];
}

function EditorHorarios({ profissionalId, inicial }: Readonly<EditorHorariosProps>) {
  const salvar = useSalvarHorarios(profissionalId);
  const [aba, setAba] = useState<HorarioTipo>('SEMANAL');
  const [linhas, setLinhas] = useState<Linha[]>(inicial);
  const [erros, setErros] = useState<string[]>([]);

  function alterar(chave: string, campos: Partial<Linha>) {
    setErros([]);
    setLinhas((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, ...campos } : l)));
  }

  async function salvarHorarios() {
    const entrada = { horarios: linhas.map(paraEntrada) };
    const resultado = salvarHorariosSchema.safeParse(entrada);
    if (!resultado.success) {
      setErros([...new Set(resultado.error.issues.map((i) => i.message))]);
      return;
    }
    setErros([]);
    try {
      await salvar.mutateAsync(entrada.horarios);
    } catch (error) {
      setErros([error instanceof Error ? error.message : 'Não foi possível salvar os horários.']);
    }
  }

  const visiveis = linhas.filter((l) => l.tipo === aba);

  return (
    <section aria-labelledby="titulo-horarios" className="grid gap-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="titulo-horarios" className="text-sm font-semibold">
          Horários de Atendimento
        </h3>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Tipo de horário" className="flex rounded-lg bg-muted p-1">
            {ABAS.map(({ tipo, rotulo }) => (
              <button
                key={tipo}
                type="button"
                role="tab"
                aria-selected={aba === tipo}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium text-muted-foreground',
                  aba === tipo && 'bg-background text-foreground shadow-xs',
                )}
                onClick={() => setAba(tipo)}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinhas((atuais) => [...atuais, novaLinha(aba)])}
          >
            <PlusIcon aria-hidden />
            Adicionar Dia
          </Button>
        </div>
      </div>

      {visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {aba === 'SEMANAL'
            ? 'Nenhum horário semanal cadastrado.'
            : 'Nenhum horário por data cadastrado.'}
        </p>
      )}

      {visiveis.map((linha) => (
        <div
          key={linha.chave}
          className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]"
        >
          <div className="grid gap-1">
            {linha.tipo === 'SEMANAL' ? (
              <Select
                value={linha.diaSemana}
                onValueChange={(valor) => alterar(linha.chave, { diaSemana: valor })}
              >
                <SelectTrigger aria-label="Dia" className="w-full">
                  <SelectValue placeholder="Dia" />
                </SelectTrigger>
                <SelectContent>
                  {DIAS_SEMANA.map((dia, indice) => (
                    <SelectItem key={dia} value={String(indice)}>
                      {dia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type="date"
                aria-label="Data"
                value={linha.data}
                onChange={(evento) => alterar(linha.chave, { data: evento.target.value })}
              />
            )}
            <span className="text-xs text-muted-foreground">
              {linha.tipo === 'SEMANAL' ? 'Dia' : 'Data'}
            </span>
          </div>
          {(
            [
              ['inicio', 'Início'],
              ['fim', 'Fim'],
              ['almocoInicio', 'Almoço de'],
              ['almocoFim', 'Almoço até'],
            ] as const
          ).map(([campo, rotulo]) => (
            <div key={campo} className="grid gap-1">
              <Input
                type="time"
                aria-label={rotulo}
                value={linha[campo]}
                onChange={(evento) => alterar(linha.chave, { [campo]: evento.target.value })}
              />
              <span className="text-xs text-muted-foreground">{rotulo}</span>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mb-5 text-destructive hover:text-destructive"
            aria-label="Remover horário"
            onClick={() => {
              setErros([]);
              setLinhas((atuais) => atuais.filter((l) => l.chave !== linha.chave));
            }}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      ))}

      {erros.length > 0 && (
        <ul className="grid gap-1 text-sm text-destructive" role="alert">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={salvar.isPending}
          onClick={() => void salvarHorarios()}
        >
          <SaveIcon aria-hidden />
          Salvar Horários
        </Button>
      </div>
    </section>
  );
}
