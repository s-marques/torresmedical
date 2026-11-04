import {
  contaReceberInputSchema,
  type ContaReceber,
  type ContaReceberFormulario,
} from '@torres/shared';
import { useMemo } from 'react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { usePlanoContas } from '../plano-contas/use-plano-contas';
import { OPCOES_STATUS } from './opcoes';
import { useCriarContaReceber, useEditarContaReceber } from './use-contas-receber';

const ID_FORMULARIO = 'form-conta-receber';

function valoresIniciais(conta?: ContaReceber): ContaReceberFormulario {
  return {
    descricao: conta?.descricao ?? '',
    pacienteId: conta?.pacienteId ?? null,
    valor: conta ? Number(conta.valor) : 0,
    dataVencimento: conta?.dataVencimento ?? '',
    formaPagamentoId: conta?.formaPagamentoId ?? null,
    planoContaId: conta?.planoContaId ?? null,
    documento: conta?.documento ?? '',
    totalParcelas: conta?.totalParcelas ?? 1,
    status: conta?.status ?? 'PENDENTE',
    observacoes: conta?.observacoes ?? '',
  };
}

export interface ModalContaReceberProps {
  /** Sem conta: "Nova Conta a Receber". Com conta: "Editar Conta a Receber". */
  conta?: ContaReceber;
  onFechar: () => void;
}

/** Modal "Nova Conta a Receber" e "Editar Conta a Receber" (`/receber`). */
export function ModalContaReceber({ conta, onFechar }: Readonly<ModalContaReceberProps>) {
  const criar = useCriarContaReceber();
  const editar = useEditarContaReceber(conta?.id ?? '');
  const form = useFormulario(contaReceberInputSchema, { defaultValues: valoresIniciais(conta) });
  const planoContas = usePlanoContas({ search: '' });
  const opcoesPlanoContas = useMemo(
    () =>
      (planoContas.data?.data ?? []).map((pc) => ({
        valor: pc.id,
        rotulo: `${pc.codigo} - ${pc.nome}`,
      })),
    [planoContas.data],
  );

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={conta ? 'Editar Conta a Receber' : 'Nova Conta a Receber'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={conta ? 'Salvar' : 'Cadastrar'}
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
          await (conta ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="descricao" label="Descrição" obrigatorio className="sm:col-span-2" />
        <FormField
          name="pacienteId"
          label="Cliente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Buscar cliente (nome, telefone)..."
          className="sm:col-span-2"
        />
        <FormField name="valor" label="Valor" tipo="moeda" obrigatorio />
        <FormField name="dataVencimento" label="Data de Vencimento" tipo="data" obrigatorio />
        <FormField
          name="formaPagamentoId"
          label="Forma de Pagamento"
          tipo="entidade"
          entidade="formas-pagamento"
          filtros={{ finalidade: 'receber' }}
          placeholder="Selecione"
        />
        <FormField
          name="planoContaId"
          label="Plano de Contas"
          tipo="select"
          opcoes={opcoesPlanoContas}
          placeholder="Selecione (opcional)"
        />
        <FormField name="documento" label="Documento" />
        <FormField name="totalParcelas" label="Total Parcelas" tipo="numero" />
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
