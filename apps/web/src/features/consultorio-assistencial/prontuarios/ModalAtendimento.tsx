import {
  ATENDIMENTO_STATUS,
  ATENDIMENTO_STATUS_ROTULOS,
  ATENDIMENTO_TIPO_ROTULOS,
  ATENDIMENTO_TIPOS,
  atendimentoInputSchema,
  type AtendimentoFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarAtendimento } from './use-prontuarios';

const ID_FORMULARIO = 'form-atendimento';

const OPCOES_TIPO = ATENDIMENTO_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: ATENDIMENTO_TIPO_ROTULOS[tipo],
}));
const OPCOES_STATUS = ATENDIMENTO_STATUS.map((status) => ({
  valor: status,
  rotulo: ATENDIMENTO_STATUS_ROTULOS[status],
}));

export interface ModalAtendimentoProps {
  pacienteId: string;
  onFechar: () => void;
}

/** Botão "Novo Atendimento" da aba Atendimentos. */
export function ModalAtendimento({ pacienteId, onFechar }: Readonly<ModalAtendimentoProps>) {
  const criar = useCriarAtendimento(pacienteId);
  const form = useFormulario(atendimentoInputSchema, {
    defaultValues: {
      profissionalId: null,
      tipo: null,
      queixa: '',
      evolucao: '',
      diagnostico: '',
      conduta: '',
      observacoes: '',
      status: 'EM_ANDAMENTO',
    } as unknown as AtendimentoFormulario,
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Novo Atendimento"
      tamanho="lg"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Criar" onCancelar={onFechar} />
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
          obrigatorio
        />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
        <FormField
          name="queixa"
          label="Queixa"
          tipo="textarea"
          placeholder="Queixa principal do paciente…"
          className="col-span-full"
        />
        <FormField
          name="evolucao"
          label="Evolução"
          tipo="textarea"
          placeholder="Evolução do quadro clínico…"
          className="col-span-full"
        />
        <FormField
          name="diagnostico"
          label="Diagnóstico"
          tipo="textarea"
          placeholder="Diagnóstico…"
        />
        <FormField name="conduta" label="Conduta" tipo="textarea" placeholder="Conduta adotada…" />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          placeholder="Observações adicionais…"
          className="col-span-full"
        />
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
      </FormLayout>
    </Modal>
  );
}
