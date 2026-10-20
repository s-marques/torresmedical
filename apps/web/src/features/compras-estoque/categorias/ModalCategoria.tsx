import {
  CATEGORIA_COR_PADRAO,
  createCategoriaSchema,
  type Categoria,
  type CategoriaFormInput,
  type TipoItem,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_TIPO } from './opcoes-tipo';
import { SeletorCor } from './SeletorCor';
import { useCriarCategoria, useEditarCategoria } from './use-categorias';

const ID_FORMULARIO = 'form-categoria';

export interface ModalCategoriaProps {
  /** Sem categoria: "Nova Categoria". Com categoria: "Editar Categoria". */
  categoria?: Categoria;
  onFechar: () => void;
}

function valoresIniciais(categoria?: Categoria): CategoriaFormInput {
  return {
    nome: categoria?.nome ?? '',
    tipo: (categoria?.tipo.toLowerCase() as TipoItem | undefined) ?? 'servico',
    cor: categoria?.cor ?? CATEGORIA_COR_PADRAO,
    descricao: categoria?.descricao ?? '',
  };
}

/** Modal "Nova Categoria" e "Editar Categoria": Nome, Tipo, Cor e Descrição. */
export function ModalCategoria({ categoria, onFechar }: Readonly<ModalCategoriaProps>) {
  const criar = useCriarCategoria();
  const editar = useEditarCategoria(categoria?.id ?? '');
  const form = useFormulario(createCategoriaSchema, { defaultValues: valoresIniciais(categoria) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={categoria ? 'Editar Categoria' : 'Nova Categoria'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={categoria ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (categoria ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio placeholder="Nome da categoria" />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
        <SeletorCor />
        <FormField name="descricao" label="Descrição" placeholder="Descrição opcional" />
      </FormLayout>
    </Modal>
  );
}
