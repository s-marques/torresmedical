import { entradaEstoqueSchema, type EntradaEstoqueFormulario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_MOTIVO_ENTRADA } from './opcoes';
import { useRegistrarEntrada } from './use-estoque';

const ID_FORMULARIO = 'form-entrada-estoque';

const VALORES_INICIAIS: EntradaEstoqueFormulario = {
  produtoId: '',
  quantidade: null as unknown as number,
  custoUnitario: null,
  motivo: 'COMPRA',
  lote: '',
  validade: '',
  documento: '',
  fornecedorId: null,
};

/**
 * Modal "Entrada Manual" (print `compras-estoque-estoque--entrada.jpg`): Produto, Quantidade,
 * Custo Unitário, Motivo, Lote, Validade e Documento, mais o Fornecedor opcional do requisito do
 * cliente (confirmado pelo dev na issue #20).
 */
export function ModalEntrada({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const registrar = useRegistrarEntrada();
  const form = useFormulario(entradaEstoqueSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Entrada Manual"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Registrar Entrada"
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
          await registrar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="produtoId"
          label="Produto"
          obrigatorio
          tipo="entidade"
          entidade="produtos"
          filtros={{ tipo: 'produto' }}
          placeholder="Buscar produto por nome ou SKU..."
          className="sm:col-span-2"
        />
        <FormField name="quantidade" label="Quantidade" obrigatorio tipo="numero" placeholder="0" />
        <FormField
          name="custoUnitario"
          label="Custo Unitário (R$)"
          tipo="moeda"
          placeholder="0,00"
        />
        <FormField
          name="motivo"
          label="Motivo"
          obrigatorio
          tipo="select"
          opcoes={OPCOES_MOTIVO_ENTRADA}
          className="sm:col-span-2"
        />
        <FormField name="lote" label="Lote" placeholder="Número do lote" />
        <FormField name="validade" label="Validade" tipo="data" />
        <FormField
          name="fornecedorId"
          label="Fornecedor"
          tipo="entidade"
          entidade="fornecedores"
          placeholder="Opcional"
          className="sm:col-span-2"
        />
        <FormField
          name="documento"
          label="Documento"
          placeholder="NF, nota, referência..."
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
