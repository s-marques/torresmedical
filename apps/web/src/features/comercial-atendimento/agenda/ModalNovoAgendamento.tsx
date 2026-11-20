import { createAgendamentoSchema, type AgendamentoFormulario } from '@torres/shared';
import { useEffect, useRef } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { hojeISO } from '@/lib/datas';
import { useCriarAgendamento, useSalaSugerida } from './use-agenda';

const ID_FORMULARIO = 'form-novo-agendamento';

export interface ModalNovoAgendamentoProps {
  /** Data inicial do campo Data (padrão: hoje). */
  data?: string;
  onFechar: () => void;
}

/** Hora cheia atual (`16:00`), valor inicial do campo Hora. */
function horaCheia(agora = new Date()): string {
  return `${String(agora.getHours()).padStart(2, '0')}:00`;
}

/** Modal "Novo Agendamento" (campos e padrões do print do inventário). */
export function ModalNovoAgendamento({ data, onFechar }: Readonly<ModalNovoAgendamentoProps>) {
  const { t } = useTranslation();
  const criar = useCriarAgendamento();
  const form = useFormulario(createAgendamentoSchema, {
    defaultValues: {
      pacienteId: null,
      profissionalId: null,
      salaId: null,
      data: data ?? hojeISO(),
      hora: horaCheia(),
      duracaoMinutos: 30,
      tipoAgendamentoId: null,
      valor: null,
      convenio: false,
      observacoes: '',
    } as unknown as AgendamentoFormulario,
  });

  const [profissionalId, dia, hora] = useWatch({
    control: form.control,
    name: ['profissionalId', 'data', 'hora'],
  }) as [string | null, string, string];
  const salaAtual = useWatch({ control: form.control, name: 'salaId' }) as string | null;
  const sugerida = useSalaSugerida(profissionalId, dia, hora).data?.salaId ?? null;
  const ultimaSugestao = useRef<string | null>(null);

  // A sala do contrato do profissional vem preenchida, mas uma sala escolhida à mão não é trocada.
  useEffect(() => {
    if (!sugerida) return;
    const atual = form.getValues('salaId') as string | null;
    if (atual && atual !== ultimaSugestao.current) return;
    form.setValue('salaId', sugerida, { shouldValidate: form.formState.isSubmitted });
    ultimaSugestao.current = sugerida;
  }, [sugerida, form]);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Novo Agendamento"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Agendar"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="pacienteId"
          label="Paciente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Buscar paciente por nome…"
          obrigatorio
          className="sm:col-span-2"
        />
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          obrigatorio
          className="sm:col-span-2"
        />
        <FormField
          name="salaId"
          label={t('agenda.campos.sala')}
          tipo="entidade"
          entidade="salas"
          placeholder={t('agenda.sala.placeholder')}
          descricao={sugerida && salaAtual === sugerida ? t('agenda.sala.sugerida') : undefined}
          obrigatorio
          className="sm:col-span-2"
        />
        <FormField name="data" label="Data" tipo="data" />
        <FormField name="hora" label="Hora" tipo="hora" />
        <FormField name="duracaoMinutos" label="Duração (min)" tipo="numero" />
        <FormField
          name="tipoAgendamentoId"
          label="Tipo"
          tipo="entidade"
          entidade="tipos-agendamento"
        />
        <FormField name="valor" label="Valor (R$)" tipo="moeda" placeholder="0.00" />
        <FormField name="convenio" label="Convênio" tipo="checkbox" className="self-end" />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          placeholder="Observações…"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
