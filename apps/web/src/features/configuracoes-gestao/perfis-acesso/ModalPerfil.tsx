import { createPerfilSchema, type Perfil, type PerfilFormulario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SeletorPaginas } from './SeletorPaginas';
import { useCriarPerfil, useEditarPerfil } from './use-perfis-acesso';

const ID_FORMULARIO = 'form-perfil';

export interface ModalPerfilProps {
  /** Sem perfil: "Novo Perfil". Com perfil: "Editar Perfil". */
  perfil?: Perfil;
  onFechar: () => void;
}

function valoresIniciais(perfil?: Perfil): PerfilFormulario {
  return {
    nome: perfil?.nome ?? '',
    descricao: perfil?.descricao ?? '',
    paginasPermitidas: perfil?.paginasPermitidas ?? [],
  };
}

/** Modal "Novo Perfil" e "Editar Perfil": Nome, Descrição e Páginas Permitidas. */
export function ModalPerfil({ perfil, onFechar }: Readonly<ModalPerfilProps>) {
  const criar = useCriarPerfil();
  const editar = useEditarPerfil(perfil?.id ?? '');
  const form = useFormulario(createPerfilSchema, { defaultValues: valoresIniciais(perfil) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={perfil ? 'Editar Perfil' : 'Novo Perfil'}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={perfil ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        colunas={2}
        acoes={null}
        onSubmit={async (valores) => {
          await (perfil ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio placeholder="Ex: Recepção" />
        <FormField
          name="descricao"
          label="Descrição"
          placeholder="Ex: Acesso para recepcionistas"
        />
        <SeletorPaginas className="sm:col-span-2" />
      </FormLayout>
    </Modal>
  );
}
