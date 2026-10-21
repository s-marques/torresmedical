import {
  createTipoAgendamentoSchema,
  TIPO_AGENDAMENTO_COR_PADRAO,
  TIPO_AGENDAMENTO_DURACAO_PADRAO,
  type TipoAgendamento,
  type TipoAgendamentoFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAlterarTipo, useCriarTipo } from './use-tipos-agendamento';

const ID_FORMULARIO = 'form-tipo-agendamento';

function valoresIniciais(tipo?: TipoAgendamento): TipoAgendamentoFormulario {
  return {
    nome: tipo?.nome ?? '',
    duracaoMinutos: tipo?.duracaoMinutos ?? TIPO_AGENDAMENTO_DURACAO_PADRAO,
    cor: tipo?.cor ?? TIPO_AGENDAMENTO_COR_PADRAO,
    permiteProcedimento: tipo?.permiteProcedimento ?? false,
    permitePacote: tipo?.permitePacote ?? false,
    soroterapia: tipo?.soroterapia ?? false,
  };
}

export interface ModalTipoAgendamentoProps {
  /** Sem tipo: "Novo Tipo de Agendamento" (Criar). Com tipo: "Editar Tipo" (Salvar). */
  tipo?: TipoAgendamento;
  onFechar: () => void;
}

export function ModalTipoAgendamento({ tipo, onFechar }: Readonly<ModalTipoAgendamentoProps>) {
  const criar = useCriarTipo();
  const alterar = useAlterarTipo(tipo?.id ?? '');
  const form = useFormulario(createTipoAgendamentoSchema, {
    defaultValues: valoresIniciais(tipo),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={tipo ? 'Editar Tipo' : 'Novo Tipo de Agendamento'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={tipo ? 'Salvar' : 'Criar'}
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
          await (tipo ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="nome"
          label="Nome"
          obrigatorio
          placeholder="Ex: Consulta, Retorno, Exame..."
          className="sm:col-span-2"
        />
        <FormField name="duracaoMinutos" label="Duração padrão (min)" tipo="numero" />
        <FormField name="cor" label="Cor" tipo="cor" />
        <FormField
          name="permiteProcedimento"
          label="Permite vincular procedimento/produto"
          tipo="checkbox"
          className="sm:col-span-2"
        />
        <FormField
          name="permitePacote"
          label="Permite vincular pacote de sessões"
          tipo="checkbox"
          className="sm:col-span-2"
        />
        <FormField
          name="soroterapia"
          label="É soroterapia (agenda separada)"
          tipo="checkbox"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
