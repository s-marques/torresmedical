import { saidaEstoqueSchema, type SaidaEstoqueFormulario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_MOTIVO_SAIDA } from './opcoes';
import { useRegistrarSaida } from './use-estoque';

const ID_FORMULARIO = 'form-saida-estoque';

const VALORES_INICIAIS: SaidaEstoqueFormulario = {
  produtoId: '',
  quantidade: null as unknown as number,
  motivo: 'USO_INTERNO',
  documento: '',
};

/**
 * Modal "Saída Manual" (print `compras-estoque-estoque--saida.jpg`): Produto, Quantidade, Motivo
 * e Documento. A API recusa saída maior que o saldo e o erro aparece no campo Quantidade.
 */
export function ModalSaida({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const registrar = useRegistrarSaida();
  const form = useFormulario(saidaEstoqueSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Saída Manual"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Registrar Saída"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
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
        />
        <FormField name="quantidade" label="Quantidade" obrigatorio tipo="numero" placeholder="0" />
        <FormField
          name="motivo"
          label="Motivo"
          obrigatorio
          tipo="select"
          opcoes={OPCOES_MOTIVO_SAIDA}
        />
        <FormField name="documento" label="Documento" placeholder="Referência, nota..." />
      </FormLayout>
    </Modal>
  );
}
