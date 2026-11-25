import { createCentroCustoSchema, type CentroCusto } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarCentroCusto, useEditarCentroCusto } from './use-centros-custo';

const ID_FORMULARIO = 'form-centro-custo';

export interface ModalCentroCustoProps {
  /** Sem centro: "Novo Centro de Custo". Com centro: "Editar Centro de Custo". */
  centro?: CentroCusto;
  onFechar: () => void;
}

/** Modal "Novo/Editar Centro de Custo": cadastro simples, só o nome (issue #163). */
export function ModalCentroCusto({ centro, onFechar }: Readonly<ModalCentroCustoProps>) {
  const { t } = useTranslation();
  const criar = useCriarCentroCusto();
  const editar = useEditarCentroCusto(centro?.id ?? '');
  const form = useFormulario(createCentroCustoSchema, {
    defaultValues: { nome: centro?.nome ?? '' },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t(
        centro ? 'contasPagar.centrosCusto.modalEditar' : 'contasPagar.centrosCusto.modalNovo',
      )}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t(centro ? 'comum.salvar' : 'contasPagar.centrosCusto.cadastrar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (centro ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="nome"
          label={t('contasPagar.centrosCusto.nome')}
          obrigatorio
          placeholder={t('contasPagar.centrosCusto.placeholderNome')}
        />
      </FormLayout>
    </Modal>
  );
}
