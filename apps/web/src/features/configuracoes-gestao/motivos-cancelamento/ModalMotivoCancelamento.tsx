import {
  createMotivoCancelamentoSchema,
  TIPOS_CANCELAMENTO,
  updateMotivoCancelamentoSchema,
  type MotivoCancelamento,
  type MotivoCancelamentoFormulario,
  type UpdateMotivoCancelamentoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarMotivo, useEditarMotivo } from './use-motivos-cancelamento';

const ID_FORMULARIO = 'form-motivo-cancelamento';

export interface ModalMotivoCancelamentoProps {
  /** Sem motivo: "Novo motivo". Com motivo: "Editar motivo". */
  motivo?: MotivoCancelamento;
  onFechar: () => void;
}

/** Novo motivo (tipo, nome e se exige observação) e edição (nome, observação e situação). */
export function ModalMotivoCancelamento({
  motivo,
  onFechar,
}: Readonly<ModalMotivoCancelamentoProps>) {
  const { t } = useTranslation();
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={
        motivo
          ? t('motivosCancelamento.modal.tituloEditar')
          : t('motivosCancelamento.modal.tituloNovo')
      }
      tamanho="md"
    >
      {motivo ? (
        <FormEdicao motivo={motivo} onFechar={onFechar} />
      ) : (
        <FormNovo onFechar={onFechar} />
      )}
    </Modal>
  );
}

function FormNovo({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const { t } = useTranslation();
  const criar = useCriarMotivo();
  const form = useFormulario(createMotivoCancelamentoSchema, {
    defaultValues: {
      tipo: 'CONSULTA',
      nome: '',
      exigeTexto: false,
    } as MotivoCancelamentoFormulario,
  });
  return (
    <FormLayout
      id={ID_FORMULARIO}
      form={form}
      acoes={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('comum.salvar')}
          onCancelar={onFechar}
        />
      }
      onSubmit={async (valores) => {
        await criar.mutateAsync(valores);
        onFechar();
      }}
    >
      <FormField
        name="tipo"
        label={t('motivosCancelamento.modal.tipo')}
        tipo="select"
        obrigatorio
        opcoes={TIPOS_CANCELAMENTO.map((valor) => ({
          valor,
          rotulo: t(`cancelamento.tipos.${valor}`),
        }))}
      />
      <FormField name="nome" label={t('motivosCancelamento.modal.nome')} obrigatorio />
      <FormField
        name="exigeTexto"
        label={t('motivosCancelamento.modal.exigeTexto')}
        tipo="switch"
      />
    </FormLayout>
  );
}

function FormEdicao({
  motivo,
  onFechar,
}: Readonly<{ motivo: MotivoCancelamento; onFechar: () => void }>) {
  const { t } = useTranslation();
  const editar = useEditarMotivo(motivo.id);
  const form = useFormulario<UpdateMotivoCancelamentoInput, UpdateMotivoCancelamentoInput>(
    updateMotivoCancelamentoSchema,
    {
      defaultValues: { nome: motivo.nome, exigeTexto: motivo.exigeTexto, ativo: motivo.ativo },
    },
  );
  return (
    <FormLayout
      id={ID_FORMULARIO}
      form={form}
      acoes={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('comum.salvar')}
          onCancelar={onFechar}
        />
      }
      onSubmit={async (valores) => {
        await editar.mutateAsync(valores);
        onFechar();
      }}
    >
      {motivo.sistema && (
        <p className="text-sm text-muted-foreground">
          {t('motivosCancelamento.modal.sistemaAviso')}
        </p>
      )}
      <FormField
        name="nome"
        label={t('motivosCancelamento.modal.nome')}
        obrigatorio
        disabled={motivo.sistema}
      />
      <FormField
        name="exigeTexto"
        label={t('motivosCancelamento.modal.exigeTexto')}
        tipo="switch"
        disabled={motivo.sistema}
      />
      <FormField
        name="ativo"
        label={t('motivosCancelamento.modal.ativo')}
        tipo="switch"
        disabled={motivo.sistema}
      />
    </FormLayout>
  );
}
