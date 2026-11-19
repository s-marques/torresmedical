import { createBypassAgenteSchema, type BypassAgente } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAdicionarBypass, useAlterarBypass } from './use-bypass-agente';

const ID_FORMULARIO = 'form-bypass-agente';

export interface ModalBypassAgenteProps {
  /** Sem registro: "Adicionar Telefone ao Bypass". Com registro: "Editar Telefone do Bypass". */
  registro?: BypassAgente;
  onFechar: () => void;
}

/** Modal do inventário (estado "Adicionar"): Telefone *, Nome e Cargo. */
export function ModalBypassAgente({ registro, onFechar }: Readonly<ModalBypassAgenteProps>) {
  const adicionar = useAdicionarBypass();
  const alterar = useAlterarBypass(registro?.id ?? '');
  const form = useFormulario(createBypassAgenteSchema, {
    defaultValues: {
      telefone: registro?.telefone ?? '',
      nome: registro?.nome ?? '',
      cargo: registro?.cargo ?? '',
    },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={registro ? 'Editar Telefone do Bypass' : 'Adicionar Telefone ao Bypass'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={registro ? 'Salvar' : 'Adicionar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (registro ? alterar : adicionar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="telefone" label="Telefone" obrigatorio placeholder="(65) 99999-9999" />
        <FormField name="nome" label="Nome" />
        <FormField name="cargo" label="Cargo" />
      </FormLayout>
    </Modal>
  );
}
