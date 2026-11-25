import {
  assinaturaInputSchema,
  type AssinaturaFormulario,
  type AssinaturaInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAssinarAtendimento } from './use-atendimento-registros';

const ID_FORMULARIO = 'form-assinar-atendimento';

export interface ModalAssinarAtendimentoProps {
  pacienteId: string;
  atendimentoId: string;
  onFechar: () => void;
}

/** "Assinar atendimento": confirmação com a senha do profissional (issue #151). */
export function ModalAssinarAtendimento({
  pacienteId,
  atendimentoId,
  onFechar,
}: Readonly<ModalAssinarAtendimentoProps>) {
  const { t } = useTranslation();
  const assinar = useAssinarAtendimento(pacienteId, atendimentoId);
  const form = useFormulario(assinaturaInputSchema, {
    defaultValues: { senha: '' } as AssinaturaFormulario,
  });

  async function confirmar(valores: AssinaturaInput) {
    await assinar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('atendimentoRegistros.assinatura.titulo')}
      descricao={t('atendimentoRegistros.assinatura.descricao')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('atendimentoRegistros.assinatura.confirmar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} onSubmit={confirmar}>
        <FormField
          name="senha"
          label={t('atendimentoRegistros.campos.senha')}
          tipo="senha"
          obrigatorio
        />
      </FormLayout>
    </Modal>
  );
}
