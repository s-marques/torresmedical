import { createNaoConformidadeSchema, NAO_CONFORMIDADE_TIPOS } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useRegistrarNaoConformidade } from './use-nao-conformidades';

const ID_FORMULARIO = 'form-nao-conformidade';

/** Modal "Nova Nao-Conformidade". Obrigatórios: Título e Tipo. */
export function ModalNaoConformidade({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const { t } = useTranslation();
  const registrar = useRegistrarNaoConformidade();
  const form = useFormulario(createNaoConformidadeSchema, {
    defaultValues: {
      titulo: '',
      descricao: '',
      setor: '',
      dataOcorrencia: '',
      dataLimiteCorrecao: '',
      responsavel: '',
      acaoCorretiva: '',
      observacoes: '',
    },
  });
  const c = (chave: string) => t(`naoConformidades.campos.${chave}`);
  const opcoesTipo = NAO_CONFORMIDADE_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`naoConformidades.tipos.${valor}`),
  }));

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('naoConformidades.novaTitulo')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('naoConformidades.registrar')}
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
          await registrar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="titulo"
          label={c('titulo')}
          placeholder={c('tituloPlaceholder')}
          obrigatorio
          className="sm:col-span-2"
        />
        <FormField
          name="descricao"
          label={c('descricao')}
          tipo="textarea"
          className="sm:col-span-2"
        />
        <FormField name="setor" label={c('setor')} />
        <FormField name="tipo" label={c('tipo')} tipo="select" opcoes={opcoesTipo} obrigatorio />
        <FormField name="dataOcorrencia" label={c('dataOcorrencia')} tipo="data" />
        <FormField name="dataLimiteCorrecao" label={c('dataLimiteCorrecao')} tipo="data" />
        <FormField name="responsavel" label={c('responsavel')} />
        <FormField
          name="acaoCorretiva"
          label={c('acaoCorretiva')}
          placeholder={c('acaoCorretivaPlaceholder')}
          tipo="textarea"
          className="sm:col-span-2"
        />
        <FormField
          name="observacoes"
          label={c('observacoes')}
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
