import { perderNegocioSchema, type Negocio, type PerderNegocioFormulario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useMotivosPerda, usePerderNegocio } from './use-pipeline';

const ID_FORMULARIO = 'form-negocio-perdido';

export interface ModalPerdidoProps {
  negocio: Negocio;
  onFechar: () => void;
}

/** "Perdido" no menu do cartão: pede o motivo da perda (lista padronizada). */
export function ModalPerdido({ negocio, onFechar }: Readonly<ModalPerdidoProps>) {
  const perder = usePerderNegocio(negocio.id);
  const motivos = useMotivosPerda();
  const form = useFormulario(perderNegocioSchema, {
    defaultValues: { motivoPerdaId: '' } as PerderNegocioFormulario,
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Marcar como perdido"
      descricao={negocio.titulo}
      tamanho="sm"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Marcar como perdido"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await perder.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="motivoPerdaId"
          label="Motivo da perda"
          tipo="select"
          obrigatorio
          opcoes={(motivos.data ?? []).map((m) => ({ valor: m.id, rotulo: m.nome }))}
        />
      </FormLayout>
    </Modal>
  );
}
