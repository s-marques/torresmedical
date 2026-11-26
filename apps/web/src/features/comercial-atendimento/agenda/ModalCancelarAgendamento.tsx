import {
  cancelarComMotivoSchema,
  type Agendamento,
  type CancelarComMotivoFormulario,
  type CancelarComMotivoInput,
} from '@torres/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalCancelamento } from '@/components/shared/cancelamento/ModalCancelamento';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { formatarData } from '@/lib/formatar';
import { diaLocal, horaLocal } from './agenda-datas';
import { useCancelarAgendamento } from './use-agenda';

export interface ModalCancelarAgendamentoProps {
  agendamento: Agendamento;
  /** Agendamentos carregados na tela: os do mesmo paciente são as opções de "Reagendou?". */
  agendamentos: readonly Agendamento[];
  onFechar: () => void;
}

/**
 * Cancelamento da consulta (issue #162, R §34): motivo da lista, observação e "Reagendou?", com o
 * link para o novo agendamento do mesmo paciente.
 */
export function ModalCancelarAgendamento({
  agendamento: a,
  agendamentos,
  onFechar,
}: Readonly<ModalCancelarAgendamentoProps>) {
  const { t } = useTranslation();
  const cancelar = useCancelarAgendamento(a.id);
  const form = useFormulario<CancelarComMotivoFormulario, CancelarComMotivoInput>(
    cancelarComMotivoSchema,
    { defaultValues: { motivoId: '', observacao: '', reagendouParaId: '' } },
  );
  const opcoes = useMemo(
    () =>
      agendamentos
        .filter((o) => o.id !== a.id && o.pacienteId === a.pacienteId && o.status !== 'CANCELADO')
        .sort((x, y) => x.inicio.localeCompare(y.inicio))
        .map((o) => ({
          valor: o.id,
          rotulo: t('cancelamento.agenda.novoAgendamento', {
            numero: o.numero,
            data: formatarData(diaLocal(o.inicio)),
            hora: horaLocal(o.inicio),
          }),
        })),
    [agendamentos, a.id, a.pacienteId, t],
  );

  return (
    <ModalCancelamento
      tipo="CONSULTA"
      titulo={t('cancelamento.agenda.titulo', { numero: a.numero })}
      descricao={t('cancelamento.agenda.descricao', {
        paciente: a.pacienteNome,
        profissional: a.profissionalNome,
        data: formatarData(diaLocal(a.inicio)),
        hora: horaLocal(a.inicio),
      })}
      rotuloConfirmar={t('cancelamento.agenda.confirmar')}
      form={form}
      opcoesReagendamento={opcoes}
      onConfirmar={(valores) => cancelar.mutateAsync(valores)}
      onFechar={onFechar}
    />
  );
}
