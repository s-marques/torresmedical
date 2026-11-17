import { loteInputSchema, type LoteFormulario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarLote } from './use-lotes';

const ID_FORMULARIO = 'form-novo-lote';

const VALORES_INICIAIS: LoteFormulario = {
  produtoId: '',
  numero: '',
  dataVencimento: '',
  quantidade: null as unknown as number,
};

/**
 * Modal "Novo Lote" (print `compras-estoque-lotes-validade--novo-lote.jpg`): Produto, Numero do
 * Lote, Data de Vencimento e Quantidade, todos obrigatórios; botões Cancelar e Cadastrar.
 */
export function ModalNovoLote({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const criar = useCriarLote();
  const form = useFormulario(loteInputSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Novo Lote"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Cadastrar"
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
          name="produtoId"
          label="Produto"
          obrigatorio
          tipo="entidade"
          entidade="produtos"
          filtros={{ tipo: 'produto' }}
          placeholder="Selecione o produto"
        />
        <FormField
          name="numero"
          label="Numero do Lote"
          obrigatorio
          placeholder="Ex: LOT-2026-001"
        />
        <FormField name="dataVencimento" label="Data de Vencimento" obrigatorio tipo="data" />
        <FormField name="quantidade" label="Quantidade" obrigatorio tipo="numero" placeholder="0" />
      </FormLayout>
    </Modal>
  );
}
