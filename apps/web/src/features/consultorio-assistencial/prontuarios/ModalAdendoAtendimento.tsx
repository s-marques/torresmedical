import { adendoInputSchema, type AdendoFormulario, type CreateAdendoInput } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarAdendo } from './use-atendimento-registros';

const ID_FORMULARIO = 'form-adendo-atendimento';

export interface ModalAdendoAtendimentoProps {
  pacienteId: string;
  atendimentoId: string;
  onFechar: () => void;
}

/** "Registrar adendo": correção de um atendimento assinado, sem alterar o original (issue #151). */
export function ModalAdendoAtendimento({
  pacienteId,
  atendimentoId,
  onFechar,
}: Readonly<ModalAdendoAtendimentoProps>) {
  const { t } = useTranslation();
  const criar = useCriarAdendo(pacienteId, atendimentoId);
  const form = useFormulario(adendoInputSchema, {
    defaultValues: { texto: '' } as AdendoFormulario,
  });

  async function salvar(valores: CreateAdendoInput) {
    await criar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('atendimentoRegistros.adendo.titulo')}
      descricao={t('atendimentoRegistros.adendo.descricao')}
      tamanho="lg"
      rodape={<FormAcoes form={form} formId={ID_FORMULARIO} onCancelar={onFechar} />}
    >
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} onSubmit={salvar}>
        <FormField
          name="texto"
          label={t('atendimentoRegistros.campos.adendo')}
          tipo="textarea"
          obrigatorio
        />
      </FormLayout>
    </Modal>
  );
}
