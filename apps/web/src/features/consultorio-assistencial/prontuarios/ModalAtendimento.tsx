import {
  ATENDIMENTO_STATUS,
  ATENDIMENTO_STATUS_ROTULOS,
  ATENDIMENTO_TIPO_ROTULOS,
  ATENDIMENTO_TIPOS,
  atendimentoInputSchema,
  type AtendimentoFormulario,
} from '@torres/shared';
import { useWatch } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { conferirRespostas } from './respostas-modelo';
import { SecaoModeloAtendimento } from './SecaoModeloAtendimento';
import { useModelosDoProfissional } from './use-modelos-prontuario';
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
      modeloId: '',
      respostas: {},
    } as unknown as AtendimentoFormulario,
  });

  // Modelos de prontuário (#152): os padrão e os do profissional escolhido.
  const profissionalId = useWatch({ control: form.control, name: 'profissionalId' }) || null;
  const modeloId = useWatch({ control: form.control, name: 'modeloId' }) || null;
  const modelos = useModelosDoProfissional(profissionalId);
  const lista = profissionalId ? (modelos.data?.data ?? []) : null;
  const modelo = lista?.find((m) => m.id === modeloId) ?? null;

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
          // Com modelo, os campos fixos não são usados; as respostas valem pelo modelo.
          if (
            modelo &&
            !conferirRespostas(
              form,
              modelo.secoes,
              valores.respostas,
              valores.status === 'FINALIZADO',
            )
          ) {
            return;
          }
          // O modelo só vale se ainda está na lista do profissional escolhido.
          await criar.mutateAsync({
            ...valores,
            modeloId: modelo?.id ?? null,
            respostas: modelo ? valores.respostas : null,
          });
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
        <SecaoModeloAtendimento modelos={lista} modelo={modelo} />
        {!modelo && <CamposFixos />}
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
      </FormLayout>
    </Modal>
  );
}

/** Campos fixos do atendimento (sem modelo de prontuário). */
function CamposFixos() {
  return (
    <>
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
    </>
  );
}
