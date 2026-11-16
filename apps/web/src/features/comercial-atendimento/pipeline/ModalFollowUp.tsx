import {
  ATIVIDADE_TIPO_ROTULO,
  ATIVIDADE_TIPOS,
  atividadeNegocioInputSchema,
  type AtividadeNegocioFormulario,
  type Negocio,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAgendarFollowUp, useResponsaveis } from './use-pipeline';

const ID_FORMULARIO = 'form-follow-up';

const OPCOES_TIPO = ATIVIDADE_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: ATIVIDADE_TIPO_ROTULO[tipo],
}));

export interface ModalFollowUpProps {
  negocio: Negocio;
  onFechar: () => void;
}

/** "Agendar Follow-up": próxima ação do negócio (tipo, título, data, hora e responsável). */
export function ModalFollowUp({ negocio, onFechar }: Readonly<ModalFollowUpProps>) {
  const agendar = useAgendarFollowUp(negocio.id);
  const responsaveis = useResponsaveis();
  const form = useFormulario(atividadeNegocioInputSchema, {
    defaultValues: {
      tipo: 'FOLLOW_UP',
      titulo: '',
      data: '',
      hora: '',
      responsavelId: negocio.responsavelId ?? '',
    } as AtividadeNegocioFormulario,
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Agendar Follow-up"
      descricao={negocio.titulo}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Agendar"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await agendar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
        <FormField name="titulo" label="Título" placeholder="Ex: Retornar contato" obrigatorio />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="data" label="Data" tipo="data" obrigatorio />
          <FormField name="hora" label="Hora" tipo="hora" obrigatorio />
        </div>
        <FormField
          name="responsavelId"
          label="Responsável"
          tipo="select"
          placeholder="Responsável do negócio"
          opcoes={(responsaveis.data ?? []).map((r) => ({ valor: r.id, rotulo: r.nome }))}
        />
      </FormLayout>
    </Modal>
  );
}
