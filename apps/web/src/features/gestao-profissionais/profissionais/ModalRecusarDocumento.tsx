import { profissionalDocumentoDecisaoSchema } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useDecidirDocumento } from './use-documentos-profissional';

const ID_FORMULARIO = 'form-recusar-documento';

export interface ModalRecusarDocumentoProps {
  profissionalId: string;
  documentoId: string;
  onFechar: () => void;
}

/** Recusa de documento: o motivo é obrigatório e fica visível na lista (issue #141). */
export function ModalRecusarDocumento({
  profissionalId,
  documentoId,
  onFechar,
}: Readonly<ModalRecusarDocumentoProps>) {
  const { t } = useTranslation();
  const decidir = useDecidirDocumento(profissionalId);
  const form = useFormulario(profissionalDocumentoDecisaoSchema, {
    defaultValues: { decisao: 'RECUSAR', motivo: '' },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('profissionalDocumentos.recusar')}
      tamanho="md"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('profissionalDocumentos.confirmarRecusa')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await decidir.mutateAsync({ documentoId, decisao: valores });
          onFechar();
        }}
      >
        <FormField
          name="motivo"
          label={t('profissionalDocumentos.campos.motivo')}
          tipo="textarea"
          obrigatorio
        />
      </FormLayout>
    </Modal>
  );
}
