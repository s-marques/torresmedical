import { createTipoTreinamentoSchema } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarTipoTreinamento } from './use-treinamentos';

const ID_FORMULARIO = 'form-tipo-treinamento';

/** Modal "Novo Tipo de Treinamento". Só o Nome é obrigatório. */
export function ModalTipoTreinamento({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const { t } = useTranslation();
  const criar = useCriarTipoTreinamento();
  const form = useFormulario(createTipoTreinamentoSchema, { defaultValues: { nome: '' } });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('treinamentos.novoTipoTitulo')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('treinamentos.criarTipo')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="nome"
          label={t('treinamentos.campos.nomeTipo')}
          placeholder={t('treinamentos.campos.nomeTipoPlaceholder')}
          obrigatorio
        />
      </FormLayout>
    </Modal>
  );
}
