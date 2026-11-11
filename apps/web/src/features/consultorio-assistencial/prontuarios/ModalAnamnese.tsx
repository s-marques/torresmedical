import { anamneseInputSchema } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarAnamnese } from './use-prontuarios';

const ID_FORMULARIO = 'form-anamnese';

export interface ModalAnamneseProps {
  pacienteId: string;
  onFechar: () => void;
}

/** Botão "Nova Anamnese" da aba Anamneses. */
export function ModalAnamnese({ pacienteId, onFechar }: Readonly<ModalAnamneseProps>) {
  const criar = useCriarAnamnese(pacienteId);
  const form = useFormulario(anamneseInputSchema, {
    defaultValues: {
      profissionalId: null,
      queixaPrincipal: '',
      historiaDoencaAtual: '',
      exameFisico: '',
      hipoteseDiagnostica: '',
      conduta: '',
    },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Nova Anamnese"
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Criar Anamnese"
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
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          className="col-span-full"
        />
        <FormField
          name="queixaPrincipal"
          label="Queixa Principal"
          tipo="textarea"
          placeholder="Motivo principal da consulta…"
          className="col-span-full"
        />
        <FormField
          name="historiaDoencaAtual"
          label="História da Doença Atual"
          tipo="textarea"
          placeholder="Descreva a história da doença atual…"
          className="col-span-full"
        />
        <FormField
          name="exameFisico"
          label="Exame Físico"
          tipo="textarea"
          placeholder="Achados do exame físico…"
        />
        <FormField
          name="hipoteseDiagnostica"
          label="Hipótese Diagnóstica"
          tipo="textarea"
          placeholder="Hipótese diagnóstica…"
        />
        <FormField
          name="conduta"
          label="Conduta"
          tipo="textarea"
          placeholder="Conduta recomendada…"
          className="col-span-full"
        />
      </FormLayout>
    </Modal>
  );
}
