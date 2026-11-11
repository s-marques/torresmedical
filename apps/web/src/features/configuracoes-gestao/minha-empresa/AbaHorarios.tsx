import { DIAS_SEMANA, salvarHorariosFuncionamentoSchema, type DiaHorario } from '@torres/shared';
import { ClockIcon, PlusIcon, SaveIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHorariosFuncionamento, useSalvarHorariosFuncionamento } from './use-minha-empresa';

interface Intervalo {
  chave: string;
  inicio: string;
  fim: string;
}

interface Dia {
  diaSemana: number;
  aberto: boolean;
  abre: string;
  fecha: string;
  intervalos: Intervalo[];
}

let sequencia = 0;
function novaChave(): string {
  sequencia += 1;
  return `intervalo-${sequencia}`;
}

function diasIniciais(dados: DiaHorario[]): Dia[] {
  return dados.map((d) => ({
    diaSemana: d.diaSemana,
    aberto: !d.fechado,
    abre: d.abre ?? '08:00',
    fecha: d.fecha ?? '18:00',
    intervalos: d.intervalos.map((i) => ({ chave: novaChave(), inicio: i.inicio, fim: i.fim })),
  }));
}

function paraEntrada(dia: Dia) {
  return {
    diaSemana: dia.diaSemana,
    fechado: !dia.aberto,
    abre: dia.abre,
    fecha: dia.fecha,
    intervalos: dia.intervalos.map(({ inicio, fim }) => ({ inicio, fim })),
  };
}

/** Aba "Horários": horário de funcionamento dos 7 dias da semana. Salva tudo de uma vez. */
export function AbaHorarios() {
  const horarios = useHorariosFuncionamento();
  if (horarios.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Não foi possível carregar os horários de funcionamento.
      </p>
    );
  }
  if (!horarios.data) {
    return <p className="text-sm text-muted-foreground">Carregando horários…</p>;
  }
  return <EditorHorarios inicial={diasIniciais(horarios.data.data)} />;
}

function EditorHorarios({ inicial }: Readonly<{ inicial: Dia[] }>) {
  const salvar = useSalvarHorariosFuncionamento();
  const [dias, setDias] = useState<Dia[]>(inicial);
  const [erros, setErros] = useState<string[]>([]);

  function alterarDia(diaSemana: number, campos: Partial<Dia>) {
    setErros([]);
    setDias((atuais) => atuais.map((d) => (d.diaSemana === diaSemana ? { ...d, ...campos } : d)));
  }

  function adicionarIntervalo(diaSemana: number) {
    alterarDia(diaSemana, {
      intervalos: [
        ...(dias.find((d) => d.diaSemana === diaSemana)?.intervalos ?? []),
        { chave: novaChave(), inicio: '12:00', fim: '13:00' },
      ],
    });
  }

  function removerIntervalo(diaSemana: number, chave: string) {
    const dia = dias.find((d) => d.diaSemana === diaSemana);
    if (!dia) return;
    alterarDia(diaSemana, { intervalos: dia.intervalos.filter((i) => i.chave !== chave) });
  }

  function alterarIntervalo(diaSemana: number, chave: string, campos: Partial<Intervalo>) {
    const dia = dias.find((d) => d.diaSemana === diaSemana);
    if (!dia) return;
    alterarDia(diaSemana, {
      intervalos: dia.intervalos.map((i) => (i.chave === chave ? { ...i, ...campos } : i)),
    });
  }

  async function salvarHorarios() {
    const entrada = { dias: dias.map(paraEntrada) };
    const resultado = salvarHorariosFuncionamentoSchema.safeParse(entrada);
    if (!resultado.success) {
      setErros([...new Set(resultado.error.issues.map((i) => i.message))]);
      return;
    }
    setErros([]);
    try {
      await salvar.mutateAsync(resultado.data.dias);
    } catch (error) {
      setErros([error instanceof Error ? error.message : 'Não foi possível salvar os horários.']);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClockIcon aria-hidden className="size-5" />
          Horários de Funcionamento
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure os dias e horários de atendimento da sua empresa
        </p>
      </div>

      <div className="grid gap-3">
        {dias.map((dia) => (
          <div key={dia.diaSemana} className="grid gap-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox
                checked={dia.aberto}
                onCheckedChange={(valor) => alterarDia(dia.diaSemana, { aberto: valor === true })}
                aria-label={DIAS_SEMANA[dia.diaSemana]}
              />
              <span className="min-w-28 font-medium">{DIAS_SEMANA[dia.diaSemana]}</span>
              {dia.aberto ? (
                <>
                  <CampoHora
                    rotulo="Abre"
                    valor={dia.abre}
                    onChange={(valor) => alterarDia(dia.diaSemana, { abre: valor })}
                  />
                  <span className="text-sm text-muted-foreground">às</span>
                  <CampoHora
                    rotulo="Fecha"
                    valor={dia.fecha}
                    onChange={(valor) => alterarDia(dia.diaSemana, { fecha: valor })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => adicionarIntervalo(dia.diaSemana)}
                  >
                    <PlusIcon aria-hidden />
                    Intervalo
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
            {dia.aberto && dia.intervalos.length > 0 && (
              <div className="ml-10 grid gap-2">
                {dia.intervalos.map((intervalo) => (
                  <div key={intervalo.chave} className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-muted-foreground">pausa</span>
                    <CampoHora
                      rotulo="Início da pausa"
                      valor={intervalo.inicio}
                      onChange={(valor) =>
                        alterarIntervalo(dia.diaSemana, intervalo.chave, { inicio: valor })
                      }
                    />
                    <span className="text-sm text-muted-foreground">às</span>
                    <CampoHora
                      rotulo="Fim da pausa"
                      valor={intervalo.fim}
                      onChange={(valor) =>
                        alterarIntervalo(dia.diaSemana, intervalo.chave, { fim: valor })
                      }
                    />
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-foreground"
                      onClick={() => removerIntervalo(dia.diaSemana, intervalo.chave)}
                    >
                      <XIcon aria-hidden className="size-3" />
                      Remover intervalo
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {erros.length > 0 && (
        <ul className="grid gap-1 text-sm text-destructive" role="alert">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button type="button" disabled={salvar.isPending} onClick={() => void salvarHorarios()}>
          <SaveIcon aria-hidden />
          Salvar Horários
        </Button>
      </div>
    </div>
  );
}

function CampoHora({
  rotulo,
  valor,
  onChange,
}: Readonly<{ rotulo: string; valor: string; onChange: (valor: string) => void }>) {
  return (
    <Label className="flex items-center gap-1 font-normal">
      <span className="sr-only">{rotulo}</span>
      <Input
        type="time"
        aria-label={rotulo}
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-32"
      />
    </Label>
  );
}
