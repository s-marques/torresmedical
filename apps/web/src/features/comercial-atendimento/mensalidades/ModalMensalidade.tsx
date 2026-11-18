import {
  mensalidadeInputSchema,
  type Mensalidade,
  type MensalidadeFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarMensalidade, useEditarMensalidade } from './use-mensalidades';

const ID_FORMULARIO = 'form-mensalidade';

function valoresIniciais(mensalidade?: Mensalidade): MensalidadeFormulario {
  return {
    // Obrigatórios no schema; vazios no formulário até o usuário preencher.
    pacienteId: (mensalidade?.pacienteId ?? null) as string,
    descricao: mensalidade?.descricao ?? '',
    valor: (mensalidade ? Number(mensalidade.valor) : null) as number,
    diaVencimento: (mensalidade?.diaVencimento ?? null) as number,
    formaPagamentoId: mensalidade?.formaPagamentoId ?? null,
    dataInicio: mensalidade?.dataInicio ?? '',
    dataFim: mensalidade?.dataFim ?? '',
    observacoes: mensalidade?.observacoes ?? '',
  };
}

export interface ModalMensalidadeProps {
  /** Sem mensalidade: "Nova Mensalidade". Com mensalidade: "Editar Mensalidade". */
  mensalidade?: Mensalidade;
  onFechar: () => void;
}

/**
 * Modal "Nova Mensalidade" e "Editar Mensalidade" (`/mensalidades`): campos e obrigatórios do
 * print `comercial-atendimento-mensalidades--nova-mensalidade.jpg`.
 */
export function ModalMensalidade({ mensalidade, onFechar }: Readonly<ModalMensalidadeProps>) {
  const criar = useCriarMensalidade();
  const editar = useEditarMensalidade(mensalidade?.id ?? '');
  const form = useFormulario(mensalidadeInputSchema, {
    defaultValues: valoresIniciais(mensalidade),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={mensalidade ? 'Editar Mensalidade' : 'Nova Mensalidade'}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={mensalidade ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (mensalidade ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="pacienteId"
          label="Cliente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Buscar paciente por nome..."
          obrigatorio
        />
        <FormField
          name="descricao"
          label="Descrição"
          placeholder="Ex: Plano mensal fisioterapia"
          obrigatorio
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="valor" label="Valor (R$)" tipo="moeda" placeholder="0,00" obrigatorio />
          <FormField
            name="diaVencimento"
            label="Dia Vencimento"
            tipo="numero"
            placeholder="1-28"
            obrigatorio
          />
          <FormField
            name="formaPagamentoId"
            label="Forma Pagamento"
            tipo="entidade"
            entidade="formas-pagamento"
            filtros={{ finalidade: 'receber' }}
            placeholder="Selecione..."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="dataInicio" label="Data Início" tipo="data" obrigatorio />
          <FormField name="dataFim" label="Data Fim" tipo="data" />
        </div>
        <FormField name="observacoes" label="Observações" tipo="textarea" />
      </FormLayout>
    </Modal>
  );
}
