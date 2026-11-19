import { prescricaoInputSchema, type PrescricaoFormulario } from '@torres/shared';
import { useMemo } from 'react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { hojeLocal, rotuloBloco } from './formatacao';
import { useBlocosDisponiveis, useCriarPrescricao } from './use-receituarios';

const ID_FORMULARIO = 'form-prescricao';

/**
 * Modal "Nova Prescricao" (print do dev na issue #42): Bloco, Paciente, Medicacao, Posologia e
 * Data da Prescricao; botões Cancelar e Prescrever. O número da receita é a próxima folha do
 * bloco e o médico é o do bloco; o select só lista blocos Ativos com médico, e "ID do Paciente"
 * virou o select de paciente (decisões do dev na issue #42).
 */
export function ModalPrescricao({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const criar = useCriarPrescricao();
  const blocos = useBlocosDisponiveis();
  const form = useFormulario(prescricaoInputSchema, {
    defaultValues: {
      blocoId: '',
      pacienteId: null as unknown as string,
      medicacao: '',
      posologia: '',
      dataPrescricao: hojeLocal(),
    } satisfies PrescricaoFormulario,
  });
  const opcoes = useMemo(
    () => (blocos.data ?? []).map((b) => ({ valor: b.id, rotulo: rotuloBloco(b) })),
    [blocos.data],
  );
  const semBlocos = blocos.isSuccess && opcoes.length === 0;

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Nova Prescricao"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Prescrever"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="blocoId"
          label="Bloco"
          tipo="select"
          opcoes={opcoes}
          placeholder="Selecione o bloco"
          obrigatorio
          descricao={
            semBlocos
              ? 'Nenhum bloco ativo com médico definido. Cadastre um bloco na aba Blocos.'
              : undefined
          }
        />
        <FormField
          name="pacienteId"
          label="Paciente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Digite o nome do paciente..."
          obrigatorio
        />
        <FormField
          name="medicacao"
          label="Medicacao"
          tipo="textarea"
          placeholder="Descreva a medicacao prescrita..."
          obrigatorio
        />
        <FormField
          name="posologia"
          label="Posologia"
          tipo="textarea"
          placeholder="Instrucoes de uso..."
        />
        <FormField name="dataPrescricao" label="Data da Prescricao" tipo="data" />
      </FormLayout>
    </Modal>
  );
}
