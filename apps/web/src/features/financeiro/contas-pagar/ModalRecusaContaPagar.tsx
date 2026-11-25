import { recusarContaPagarSchema, type ContaPagar } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useRecusarContaPagar } from './use-contas-pagar';

const ID_FORMULARIO = 'form-recusa-conta-pagar';

export interface ModalRecusaContaPagarProps {
  conta: ContaPagar;
  onFechar: () => void;
}

/** Modal "Recusar Conta a Pagar": o motivo é obrigatório (issue #164). */
export function ModalRecusaContaPagar({ conta, onFechar }: Readonly<ModalRecusaContaPagarProps>) {
  const { t } = useTranslation();
  const recusar = useRecusarContaPagar(conta.id);
  const form = useFormulario(recusarContaPagarSchema, { defaultValues: { motivo: '' } });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('contasPagar.aprovacao.recusarTitulo')}
      descricao={t('contasPagar.aprovacao.recusarDescricao', { descricao: conta.descricao })}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('contasPagar.aprovacao.recusar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await recusar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="motivo"
          label={t('contasPagar.aprovacao.motivo')}
          tipo="textarea"
          obrigatorio
          placeholder={t('contasPagar.aprovacao.motivoPlaceholder')}
        />
      </FormLayout>
    </Modal>
  );
}
