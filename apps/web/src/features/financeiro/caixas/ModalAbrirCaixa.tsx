import { abrirCaixaSchema, type AbrirCaixaFormulario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAbrirCaixa } from './use-caixas';

const ID_FORMULARIO = 'form-abrir-caixa';

/** Os dois campos são obrigatórios; moeda vazia fica `null` e o schema recusa. */
const VALORES_INICIAIS = { nome: '', valorAbertura: null } as unknown as AbrirCaixaFormulario;

export function ModalAbrirCaixa({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const abrir = useAbrirCaixa();
  const form = useFormulario(abrirCaixaSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Abrir Caixa"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Abrir" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await abrir.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio placeholder="Nome do caixa" />
        <FormField name="valorAbertura" label="Valor de abertura (R$)" tipo="moeda" obrigatorio />
      </FormLayout>
    </Modal>
  );
}
