import {
  updateAgendamentoSchema,
  type Agendamento,
  type UpdateAgendamentoFormulario,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { diaLocal, horaLocal } from './agenda-datas';
import { useAlterarAgendamento } from './use-agenda';

const ID_FORMULARIO = 'form-editar-agendamento';

export interface ModalEditarAgendamentoProps {
  agendamento: Agendamento;
  onFechar: () => void;
}

/**
 * Modal "Editar Agendamento" (issue #136): troca sala, data, hora e duração. A API refaz as
 * mesmas conferências da criação; um conflito (409) aparece no topo do formulário, com a sala ou
 * o profissional e o horário que conflitam.
 */
export function ModalEditarAgendamento({
  agendamento: a,
  onFechar,
}: Readonly<ModalEditarAgendamentoProps>) {
  const { t } = useTranslation();
  const alterar = useAlterarAgendamento(a.id);
  const form = useFormulario(updateAgendamentoSchema, {
    defaultValues: {
      salaId: a.salaId,
      data: diaLocal(a.inicio),
      hora: horaLocal(a.inicio),
      duracaoMinutos: a.duracaoMinutos,
    } as unknown as UpdateAgendamentoFormulario,
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('agenda.editar.titulo', { numero: a.numero })}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('comum.salvar')}
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
          await alterar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="salaId"
          label={t('agenda.campos.sala')}
          tipo="entidade"
          entidade="salas"
          placeholder={t('agenda.sala.placeholder')}
          descricao={a.salaId ? undefined : t('agenda.editar.semSalaAviso')}
          obrigatorio
          className="sm:col-span-2"
        />
        <FormField name="data" label={t('agenda.campos.data')} tipo="data" />
        <FormField name="hora" label={t('agenda.campos.hora')} tipo="hora" />
        <FormField name="duracaoMinutos" label={t('agenda.campos.duracao')} tipo="numero" />
      </FormLayout>
    </Modal>
  );
}
