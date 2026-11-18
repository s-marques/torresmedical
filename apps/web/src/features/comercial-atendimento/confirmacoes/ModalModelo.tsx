import {
  CONFIRMACAO_VARIAVEIS,
  confirmacaoModeloInputSchema,
  type ConfirmacaoModelo,
  type ConfirmacaoModeloFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useSalvarModelo } from './use-confirmacoes';

const ID_FORMULARIO = 'form-modelo-confirmacao';
export const AJUDA_VARIAVEIS = `Variáveis: ${CONFIRMACAO_VARIAVEIS.join(', ')}.`;

function valoresIniciais(modelo?: ConfirmacaoModelo): ConfirmacaoModeloFormulario {
  return {
    tipoAgendamentoId: modelo?.tipoAgendamentoId ?? (null as unknown as string),
    msg1: modelo?.msg1 ?? '',
    msg2: modelo?.msg2 ?? '',
    msg3: modelo?.msg3 ?? '',
    lembreteConfirmado: modelo?.lembreteConfirmado ?? '',
    lembreteNaoConfirmado: modelo?.lembreteNaoConfirmado ?? '',
  };
}

/** Modal "Novo Modelo" / "Editar": os textos das mensagens de um tipo de agendamento. */
export function ModalModelo({
  modelo,
  onFechar,
}: Readonly<{ modelo?: ConfirmacaoModelo; onFechar: () => void }>) {
  const salvar = useSalvarModelo(modelo?.id);
  const form = useFormulario(confirmacaoModeloInputSchema, {
    defaultValues: valoresIniciais(modelo),
  });

  return (
    <Modal
      aberto
      tamanho="lg"
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={modelo ? 'Editar Modelo' : 'Novo Modelo'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={modelo ? 'Salvar' : 'Criar Modelo'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await salvar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="tipoAgendamentoId"
          label="Tipo de Agendamento"
          tipo="entidade"
          entidade="tipos-agendamento"
          placeholder="Selecione"
          obrigatorio
        />
        <FormField
          name="msg1"
          label="MSG1"
          tipo="textarea"
          descricao={AJUDA_VARIAVEIS}
          obrigatorio
        />
        <FormField name="msg2" label="MSG2" tipo="textarea" obrigatorio />
        <FormField name="msg3" label="MSG3" tipo="textarea" obrigatorio />
        <FormField
          name="lembreteConfirmado"
          label="Lembrete (confirmou)"
          tipo="textarea"
          obrigatorio
        />
        <FormField
          name="lembreteNaoConfirmado"
          label="Lembrete (não confirmou)"
          tipo="textarea"
          obrigatorio
        />
      </FormLayout>
    </Modal>
  );
}
