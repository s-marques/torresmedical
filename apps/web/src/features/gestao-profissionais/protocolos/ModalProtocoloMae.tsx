import {
  createProtocoloMaeSchema,
  PROTOCOLO_SEMANAS_MAX,
  type ProtocoloMae,
  type ProtocoloMaeFormulario,
} from '@torres/shared';
import { useEffect } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { useAlterarProtocoloMae, useCriarProtocoloMae, useProtocolos } from './use-protocolos';

const ID_FORMULARIO = 'form-protocolo-mae';
const SEM_PROTOCOLO = '__sem-protocolo__';

type Semanas = NonNullable<ProtocoloMaeFormulario['semanas']>;

function valoresIniciais(mae?: ProtocoloMae): ProtocoloMaeFormulario {
  return {
    nome: mae?.nome ?? '',
    categoria: mae?.categoria ?? 'Geral',
    totalSemanas: mae?.totalSemanas ?? 1,
    valorTotal: mae?.valorTotal ?? 0,
    descricao: mae?.descricao ?? '',
    semanas: mae?.semanas.map((s) => ({
      semana: s.semana,
      protocoloId: s.protocoloId,
      observacoes: s.observacoes ?? '',
    })) ?? [{ semana: 1, protocoloId: null, observacoes: '' }],
  };
}

/** Uma linha por semana, de 1 até o total informado, mantendo o que já foi preenchido. */
function ajustarSemanas(atuais: Semanas, total: number): Semanas {
  return Array.from({ length: total }, (_, indice) => {
    const semana = indice + 1;
    return (
      atuais.find((s) => s.semana === semana) ?? { semana, protocoloId: null, observacoes: '' }
    );
  });
}

/** "Protocolos por Semana": um select de protocolo e as observações de cada semana. */
function SemanasProtocoloMae() {
  const { control, setValue, getValues } = useFormContext<ProtocoloMaeFormulario>();
  const total = useWatch({ control, name: 'totalSemanas' });
  const semanas = useWatch({ control, name: 'semanas' }) ?? [];
  const protocolos = useProtocolos({ search: '', categoria: null, profissionalId: null, page: 1 });
  const quantidade =
    typeof total === 'number' && Number.isInteger(total)
      ? Math.min(Math.max(total, 0), PROTOCOLO_SEMANAS_MAX)
      : null;

  useEffect(() => {
    if (quantidade === null || quantidade === (getValues('semanas') ?? []).length) return;
    setValue('semanas', ajustarSemanas(getValues('semanas') ?? [], quantidade));
  }, [quantidade, getValues, setValue]);

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Protocolos por Semana</legend>
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
        {semanas.map((semana, indice) => (
          <div key={semana.semana} className="grid gap-2">
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-sm font-semibold text-primary">
                Semana {semana.semana}
              </span>
              <Controller
                control={control}
                name={`semanas.${indice}.protocoloId`}
                render={({ field }) => (
                  <Select
                    value={field.value ?? SEM_PROTOCOLO}
                    onValueChange={(valor) =>
                      field.onChange(valor === SEM_PROTOCOLO ? null : valor)
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label={`Protocolo da semana ${semana.semana}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_PROTOCOLO}>-- Sem protocolo --</SelectItem>
                      {protocolos.data?.data.map((protocolo) => (
                        <SelectItem key={protocolo.id} value={protocolo.id}>
                          {protocolo.valorTotal > 0
                            ? `${protocolo.nome} - ${formatarMoeda(protocolo.valorTotal)}`
                            : protocolo.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Controller
              control={control}
              name={`semanas.${indice}.observacoes`}
              render={({ field }) => (
                <Input
                  className="ml-[calc(5rem+0.75rem)] w-[calc(100%-5rem-0.75rem)]"
                  placeholder="Observações desta semana (opcional)"
                  aria-label={`Observações da semana ${semana.semana}`}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export interface ModalProtocoloMaeProps {
  /** Sem protocolo mãe: "Novo Protocolo Mãe". Com ele: "Editar Protocolo Mãe". */
  mae?: ProtocoloMae;
  onFechar: () => void;
}

export function ModalProtocoloMae({ mae, onFechar }: Readonly<ModalProtocoloMaeProps>) {
  const criar = useCriarProtocoloMae();
  const alterar = useAlterarProtocoloMae(mae?.id ?? '');
  const form = useFormulario(createProtocoloMaeSchema, { defaultValues: valoresIniciais(mae) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={mae ? 'Editar Protocolo Mãe' : 'Novo Protocolo Mãe'}
      tamanho="lg"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={3}
        onSubmit={async (valores) => {
          await (mae ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="nome"
          label="Nome"
          obrigatorio
          placeholder="Ex: Tratamento Facial Completo"
          className="col-span-full"
        />
        <FormField name="categoria" label="Categoria" placeholder="Geral" />
        <FormField name="totalSemanas" label="Total de Semanas" tipo="numero" obrigatorio />
        <FormField name="valorTotal" label="Valor Total (R$)" tipo="moeda" />
        <FormField name="descricao" label="Descrição" tipo="textarea" className="col-span-full" />
        <div className="col-span-full">
          <SemanasProtocoloMae />
        </div>
      </FormLayout>
    </Modal>
  );
}
