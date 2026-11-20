import { createTipoLicencaSchema } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarTipoLicenca } from './use-alvaras-licencas';

const ID_FORMULARIO = 'form-tipo-licenca';

/** Modal "Novo Tipo de Licenca". Só o Nome é obrigatório. */
export function ModalTipoLicenca({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const { t } = useTranslation();
  const criar = useCriarTipoLicenca();
  const form = useFormulario(createTipoLicencaSchema, {
    defaultValues: { nome: '', descricao: '' },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('alvarasLicencas.novoTipoTitulo')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('alvarasLicencas.criarTipo')}
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
          label={t('alvarasLicencas.campos.nome')}
          placeholder={t('alvarasLicencas.campos.nomePlaceholder')}
          obrigatorio
        />
        <FormField
          name="descricao"
          label={t('alvarasLicencas.campos.descricao')}
          placeholder={t('alvarasLicencas.campos.descricaoPlaceholder')}
          tipo="textarea"
        />
        <p className="text-xs text-muted-foreground">{t('alvarasLicencas.regraParidade')}</p>
      </FormLayout>
    </Modal>
  );
}
