import {
  createFornecedorSchema,
  FORNECEDOR_UFS,
  type Fornecedor,
  type FornecedorFormInput,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_STATUS, OPCOES_UF } from './opcoes';
import { useCriarFornecedor, useEditarFornecedor } from './use-fornecedores';

const ID_FORMULARIO = 'form-fornecedor';

export interface ModalFornecedorProps {
  /** Sem fornecedor: "Novo Fornecedor". Com fornecedor: "Editar Fornecedor". */
  fornecedor?: Fornecedor;
  onFechar: () => void;
}

function valoresIniciais(f?: Fornecedor): FornecedorFormInput {
  const uf = FORNECEDOR_UFS.find((sigla) => sigla === f?.uf);
  return {
    nome: f?.nome ?? '',
    nomeFantasia: f?.nomeFantasia ?? '',
    documento: f?.documento ?? '',
    email: f?.email ?? '',
    contato: f?.contato ?? '',
    telefone: f?.telefone ?? '',
    celular: f?.celular ?? '',
    cep: f?.cep ?? '',
    logradouro: f?.logradouro ?? '',
    numero: f?.numero ?? '',
    complemento: f?.complemento ?? '',
    bairro: f?.bairro ?? '',
    cidade: f?.cidade ?? '',
    uf: uf ?? '',
    status: f && !f.ativo ? 'inativo' : 'ativo',
    observacoes: f?.observacoes ?? '',
  };
}

/** Modal "Novo Fornecedor" e "Editar Fornecedor". Só o Nome / Razão Social é obrigatório. */
export function ModalFornecedor({ fornecedor, onFechar }: Readonly<ModalFornecedorProps>) {
  const criar = useCriarFornecedor();
  const editar = useEditarFornecedor(fornecedor?.id ?? '');
  const form = useFormulario(createFornecedorSchema, {
    defaultValues: valoresIniciais(fornecedor),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={fornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={fornecedor ? 'Salvar' : 'Cadastrar'}
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
          await (fornecedor ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome / Razão Social" obrigatorio className="sm:col-span-2" />
        <FormField name="nomeFantasia" label="Nome Fantasia" />
        <FormField name="documento" label="CNPJ/CPF" tipo="cpf-cnpj" />
        <FormField name="email" label="Email" tipo="email" />
        <FormField name="contato" label="Pessoa de Contato" />
        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <FormField name="celular" label="Celular" tipo="telefone" />
        <FormField name="cep" label="CEP" tipo="cep" />
        <FormField name="logradouro" label="Logradouro" />
        <FormField name="numero" label="Número" />
        <FormField name="complemento" label="Complemento" />
        <FormField name="bairro" label="Bairro" />
        <FormField name="cidade" label="Cidade" />
        <FormField name="uf" label="UF" tipo="select" opcoes={OPCOES_UF} />
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
