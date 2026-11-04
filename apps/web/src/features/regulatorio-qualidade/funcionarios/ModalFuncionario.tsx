import {
  createFuncionarioSchema,
  type Funcionario,
  type FuncionarioFormInput,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_STATUS, OPCOES_TIPO_CONTRATO } from './opcoes';
import { useCriarFuncionario, useEditarFuncionario } from './use-funcionarios';

const ID_FORMULARIO = 'form-funcionario';

export interface ModalFuncionarioProps {
  /** Sem funcionário: "Novo Funcionario". Com funcionário: "Editar Funcionario". */
  funcionario?: Funcionario;
  onFechar: () => void;
}

/** O salário chega da API como texto decimal exato (ex.: `"8000.00"`); o campo moeda guarda número. */
function numero(valor: string | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

function valoresIniciais(f?: Funcionario): FuncionarioFormInput {
  return {
    nome: f?.nome ?? '',
    cpf: f?.cpf ?? '',
    rg: f?.rg ?? '',
    dataNascimento: f?.dataNascimento ?? '',
    dataAdmissao: f?.dataAdmissao ?? '',
    telefone: f?.telefone ?? '',
    email: f?.email ?? '',
    endereco: f?.endereco ?? '',
    cargoId: f?.cargoId ?? null,
    salario: numero(f?.salario),
    tipoContrato: f?.tipoContrato ?? null,
    cargaHoraria: f?.cargaHoraria ?? null,
    pis: f?.pis ?? '',
    ctps: f?.ctps ?? '',
    banco: f?.banco ?? '',
    agencia: f?.agencia ?? '',
    conta: f?.conta ?? '',
    status: f && !f.ativo ? 'inativo' : 'ativo',
    observacoes: f?.observacoes ?? '',
  };
}

/** Modal "Novo Funcionario" e "Editar Funcionario". Só o Nome é obrigatório. */
export function ModalFuncionario({ funcionario, onFechar }: Readonly<ModalFuncionarioProps>) {
  const criar = useCriarFuncionario();
  const editar = useEditarFuncionario(funcionario?.id ?? '');
  const form = useFormulario(createFuncionarioSchema, {
    defaultValues: valoresIniciais(funcionario),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={funcionario ? 'Editar Funcionario' : 'Novo Funcionario'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={funcionario ? 'Salvar' : 'Cadastrar'}
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
          await (funcionario ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio className="sm:col-span-2" />
        <FormField name="cpf" label="CPF" tipo="cpf" />
        <FormField name="rg" label="RG" />
        <FormField name="dataNascimento" label="Data de Nascimento" tipo="data" />
        <FormField name="dataAdmissao" label="Data de Admissão" tipo="data" />
        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <FormField name="email" label="Email" tipo="email" />
        <FormField name="endereco" label="Endereço" className="sm:col-span-2" />
        <FormField name="cargoId" label="Cargo" tipo="entidade" entidade="cargos" />
        <FormField name="salario" label="Salário" tipo="moeda" />
        <FormField
          name="tipoContrato"
          label="Tipo de Contrato"
          tipo="select"
          opcoes={OPCOES_TIPO_CONTRATO}
        />
        <FormField name="cargaHoraria" label="Carga Horária (h/semana)" tipo="numero" />
        <FormField name="pis" label="PIS" />
        <FormField name="ctps" label="CTPS" />
        <FormField name="banco" label="Banco" />
        <FormField name="agencia" label="Agência" />
        <FormField name="conta" label="Conta" />
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
