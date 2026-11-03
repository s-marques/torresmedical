import { createCargoSchema, type Cargo, type CargoFormInput } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_STATUS } from './opcoes';
import { useCriarCargo, useEditarCargo } from './use-cargos';

const ID_FORMULARIO = 'form-cargo';

export interface ModalCargoProps {
  /** Sem cargo: "Novo Cargo". Com cargo: "Editar Cargo". */
  cargo?: Cargo;
  onFechar: () => void;
}

/** O salário base chega da API como texto decimal exato; o campo moeda guarda número. */
function numero(valor: string | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

function valoresIniciais(c?: Cargo): CargoFormInput {
  return {
    nome: c?.nome ?? '',
    departamento: c?.departamento ?? '',
    descricao: c?.descricao ?? '',
    salarioBase: numero(c?.salarioBase),
    status: c && !c.ativo ? 'inativo' : 'ativo',
  };
}

/** Modal "Novo Cargo" e "Editar Cargo" (aba "Cargos"). Só o Nome é obrigatório. */
export function ModalCargo({ cargo, onFechar }: Readonly<ModalCargoProps>) {
  const criar = useCriarCargo();
  const editar = useEditarCargo(cargo?.id ?? '');
  const form = useFormulario(createCargoSchema, { defaultValues: valoresIniciais(cargo) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={cargo ? 'Editar Cargo' : 'Novo Cargo'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={cargo ? 'Salvar' : 'Cadastrar'}
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
          await (cargo ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio className="sm:col-span-2" />
        <FormField name="departamento" label="Departamento" />
        <FormField name="salarioBase" label="Salário Base" tipo="moeda" />
        <FormField name="descricao" label="Descrição" tipo="textarea" className="sm:col-span-2" />
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
      </FormLayout>
    </Modal>
  );
}
