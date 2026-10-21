import {
  BLOQUEIO_MOTIVO_ROTULOS,
  BLOQUEIO_MOTIVOS,
  criarBloqueioSchema,
  type BloqueioAgenda,
  type CriarBloqueioInput,
  type Profissional,
} from '@torres/shared';
import { CalendarXIcon, LockIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatarData } from './formatadores';
import { useBloqueios, useCriarBloqueio, useRemoverBloqueio } from './use-profissionais';

const ID_FORMULARIO = 'form-bloqueio';

const OPCOES_MOTIVO = BLOQUEIO_MOTIVOS.map((valor) => ({
  valor,
  rotulo: BLOQUEIO_MOTIVO_ROTULOS[valor],
}));

type Modo = 'UNICO' | 'LOTE';

const VALORES_INICIAIS: CriarBloqueioInput = {
  dataInicio: '',
  dataFim: '',
  tipo: 'DIA_INTEIRO',
  horaInicio: '',
  horaFim: '',
  motivo: undefined as never,
};

function descricaoDoPeriodo(b: BloqueioAgenda): string {
  if (b.tipo === 'HORARIO') {
    return `${formatarData(b.dataInicio)}, ${b.horaInicio} às ${b.horaFim}`;
  }
  return b.dataInicio === b.dataFim
    ? `${formatarData(b.dataInicio)} (dia inteiro)`
    : `${formatarData(b.dataInicio)} a ${formatarData(b.dataFim)}`;
}

export interface ModalBloqueiosProps {
  profissional: Pick<Profissional, 'id' | 'nome'>;
  onFechar: () => void;
}

/** "Bloqueios de Agenda — <nome>": Data Única ou Lote (período), mais a lista de bloqueios ativos. */
export function ModalBloqueios({ profissional, onFechar }: Readonly<ModalBloqueiosProps>) {
  const [modo, setModo] = useState<Modo>('UNICO');
  const [removendo, setRemovendo] = useState<BloqueioAgenda | null>(null);
  const bloqueios = useBloqueios(profissional.id);
  const criar = useCriarBloqueio(profissional.id);
  const remover = useRemoverBloqueio(profissional.id);
  const form = useFormulario(criarBloqueioSchema, { defaultValues: VALORES_INICIAIS });
  const tipo = useWatch({ control: form.control, name: 'tipo' });

  function trocarModo(novo: Modo) {
    setModo(novo);
    form.reset(VALORES_INICIAIS);
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={`Bloqueios de Agenda — ${profissional.nome}`}
      tamanho="lg"
      rodape={
        <Button type="button" variant="outline" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      <div className="grid gap-5">
        <div
          role="tablist"
          aria-label="Tipo de bloqueio"
          className="flex w-fit rounded-lg bg-muted p-1"
        >
          {(
            [
              ['UNICO', 'Data Única'],
              ['LOTE', 'Lote (período)'],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={modo === valor}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium text-muted-foreground',
                modo === valor && 'bg-background text-foreground shadow-xs',
              )}
              onClick={() => trocarModo(valor)}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <FormLayout
          id={ID_FORMULARIO}
          form={form}
          colunas={2}
          acoes={null}
          className="rounded-lg border p-4"
          onSubmit={async (valores) => {
            await criar.mutateAsync(valores as unknown as CriarBloqueioInput);
            form.reset(VALORES_INICIAIS);
          }}
        >
          {modo === 'UNICO' ? (
            <>
              <FormField name="dataInicio" label="Data" tipo="data" />
              <Controller
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <fieldset className="grid content-start gap-2">
                    <legend className="text-sm font-medium">Tipo</legend>
                    <div className="flex flex-wrap gap-4">
                      {(
                        [
                          ['DIA_INTEIRO', 'Dia inteiro'],
                          ['HORARIO', 'Horário específico'],
                        ] as const
                      ).map(([valor, rotulo]) => (
                        <label key={valor} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={field.name}
                            value={valor}
                            checked={field.value === valor}
                            onChange={() => field.onChange(valor)}
                          />
                          {rotulo}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              />
              {tipo === 'HORARIO' && (
                <>
                  <FormField name="horaInicio" label="Hora inicial" tipo="hora" />
                  <FormField name="horaFim" label="Hora final" tipo="hora" />
                </>
              )}
            </>
          ) : (
            <>
              <FormField name="dataInicio" label="Data Início" tipo="data" />
              <FormField name="dataFim" label="Data Fim" tipo="data" />
            </>
          )}
          <FormField
            name="motivo"
            label="Motivo"
            tipo="select"
            opcoes={OPCOES_MOTIVO}
            placeholder="Selecione o motivo"
            className="sm:col-span-2"
          />
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <LockIcon aria-hidden />
              Bloquear
            </Button>
          </div>
        </FormLayout>

        <section aria-labelledby="titulo-bloqueios-ativos" className="grid gap-2">
          <h3 id="titulo-bloqueios-ativos" className="font-semibold">
            Bloqueios Ativos
          </h3>
          {bloqueios.isPending && <Skeleton className="h-10" aria-busy />}
          {bloqueios.isError && (
            <p className="text-sm text-destructive" role="alert">
              Não foi possível carregar os bloqueios.
            </p>
          )}
          {bloqueios.data?.data.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum bloqueio cadastrado.
            </p>
          )}
          {bloqueios.data && bloqueios.data.data.length > 0 && (
            <ul className="grid gap-2">
              {bloqueios.data.data.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <CalendarXIcon aria-hidden className="size-4 shrink-0 text-destructive" />
                    <span className="font-medium">{descricaoDoPeriodo(b)}</span>
                    <span className="text-muted-foreground">
                      {BLOQUEIO_MOTIVO_ROTULOS[b.motivo]}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Remover bloqueio de ${descricaoDoPeriodo(b)}`}
                    onClick={() => setRemovendo(b)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => aberto || setRemovendo(null)}
        titulo="Remover bloqueio"
        descricao="Remover este bloqueio? A agenda do profissional volta a ficar disponível no período."
        rotuloConfirmar="Remover"
        onConfirmar={() => (removendo ? remover.mutateAsync(removendo.id) : undefined)}
      />
    </Modal>
  );
}
