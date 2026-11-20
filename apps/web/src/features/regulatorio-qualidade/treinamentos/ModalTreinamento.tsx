import { createTreinamentoSchema } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCadastrarTreinamento, useTiposTreinamento } from './use-treinamentos';

const ID_FORMULARIO = 'form-treinamento';

/** Modal "Novo Treinamento". Obrigatórios: Funcionário e Tipo. */
export function ModalTreinamento({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const { t } = useTranslation();
  const cadastrar = useCadastrarTreinamento();
  const tipos = useTiposTreinamento();
  const form = useFormulario(createTreinamentoSchema, {
    defaultValues: {
      funcionarioId: '',
      tipoTreinamentoId: '',
      descricao: '',
      dataRealizacao: '',
      dataVencimento: '',
      cargaHoraria: '',
      instituicao: '',
      observacoes: '',
    },
  });
  const c = (chave: string) => t(`treinamentos.campos.${chave}`);
  const opcoesTipos = (tipos.data ?? []).map((tipo) => ({ valor: tipo.id, rotulo: tipo.nome }));

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('treinamentos.novoTitulo')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('treinamentos.cadastrar')}
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
          await cadastrar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="funcionarioId"
          label={c('funcionario')}
          tipo="entidade"
          entidade="funcionarios"
          obrigatorio
        />
        <FormField
          name="tipoTreinamentoId"
          label={c('tipo')}
          tipo="select"
          opcoes={opcoesTipos}
          obrigatorio
        />
        <FormField
          name="descricao"
          label={c('descricao')}
          tipo="textarea"
          className="sm:col-span-2"
        />
        <FormField name="dataRealizacao" label={c('dataRealizacao')} tipo="data" />
        <FormField name="dataVencimento" label={c('dataVencimento')} tipo="data" />
        <FormField name="cargaHoraria" label={c('cargaHoraria')} tipo="numero" />
        <FormField name="instituicao" label={c('instituicao')} />
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
