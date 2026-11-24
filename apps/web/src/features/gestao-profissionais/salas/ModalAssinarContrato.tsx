import {
  assinarContratoSalaSchema,
  type AssinarContratoSalaFormulario,
  type AssinarContratoSalaInput,
  type ContratoSala,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FileUpload } from '@/components/shared/FileUpload';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { hojeISO } from '@/lib/datas';
import { useAssinarContrato } from './use-contratos-sala';

const ID_FORMULARIO = 'form-assinar-contrato';

export interface ModalAssinarContratoProps {
  contrato: ContratoSala;
  onFechar: () => void;
}

/**
 * "Registrar assinatura" (issue #142): data da assinatura e, opcionalmente, o PDF assinado. É só
 * o registro (sem assinatura eletrônica). Ao confirmar, o contrato fica ativo, o profissional
 * ganha o checklist de onboarding e a cobrança do primeiro mês é gerada (contrato Mensal).
 */
export function ModalAssinarContrato({ contrato, onFechar }: Readonly<ModalAssinarContratoProps>) {
  const { t } = useTranslation();
  const assinar = useAssinarContrato(contrato.id);
  const form = useFormulario<AssinarContratoSalaFormulario, AssinarContratoSalaInput>(
    assinarContratoSalaSchema,
    { defaultValues: { assinadoEm: hojeISO(), pdfArquivoId: null } },
  );

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('onboarding.assinatura.titulo')}
      descricao={t('onboarding.assinatura.descricao', { locatario: contrato.locatarioNome })}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('onboarding.assinatura.confirmar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await assinar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="assinadoEm"
          label={t('onboarding.assinatura.data')}
          tipo="data"
          obrigatorio
        />
        <FileUpload
          uso="contrato-sala"
          label={t('onboarding.assinatura.pdf')}
          onUploaded={(arquivo) =>
            form.setValue('pdfArquivoId', arquivo.id, { shouldDirty: true, shouldValidate: true })
          }
        />
        <p className="text-sm text-muted-foreground">{t('onboarding.assinatura.efeitos')}</p>
      </FormLayout>
    </Modal>
  );
}
