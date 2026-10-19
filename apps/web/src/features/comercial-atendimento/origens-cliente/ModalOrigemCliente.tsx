import { createOrigemClienteSchema, type OrigemCliente } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarOrigem, useRenomearOrigem } from './use-origens-cliente';

const ID_FORMULARIO = 'form-origem-cliente';

export interface ModalOrigemClienteProps {
  /** Sem origem: "Nova Origem". Com origem: "Renomear Origem". */
  origem?: OrigemCliente;
  onFechar: () => void;
}

/** Modal "Nova Origem" e "Renomear Origem": os dois só têm o campo Nome. */
export function ModalOrigemCliente({ origem, onFechar }: Readonly<ModalOrigemClienteProps>) {
  const criar = useCriarOrigem();
  const renomear = useRenomearOrigem(origem?.id ?? '');
  const form = useFormulario(createOrigemClienteSchema, {
    defaultValues: { nome: origem?.nome ?? '' },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={origem ? 'Renomear Origem' : 'Nova Origem'}
      rodape={<FormAcoes form={form} formId={ID_FORMULARIO} onCancelar={onFechar} />}
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (origem ? renomear : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio placeholder="Ex: Facebook Ads" />
      </FormLayout>
    </Modal>
  );
}
