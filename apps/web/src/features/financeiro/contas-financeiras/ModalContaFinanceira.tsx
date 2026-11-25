import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import type { OpcaoCampo } from '@/components/shared/form/tipos';
import { Modal } from '@/components/shared/Modal';
import { usePlanoContas } from '../plano-contas/use-plano-contas';

export interface ModalContaFinanceiraProps<TIn extends FieldValues, TOut> {
  titulo: string;
  editando: boolean;
  form: UseFormReturn<TIn, unknown, TOut>;
  formId: string;
  /** Devolver `false` mantém o modal aberto (ex.: o usuário ainda vai confirmar um alerta). */
  onSubmit: (valores: TOut) => Promise<unknown>;
  onFechar: () => void;
  /** Formas de pagamento oferecidas: as de pagar ou as de receber. */
  finalidade: 'pagar' | 'receber';
  opcoesStatus: readonly OpcaoCampo[];
  /** Campo da pessoa (fornecedor/funcionário ou cliente), logo abaixo da Descrição. */
  pessoa: ReactNode;
  /** Campos da tela logo após o Status (ex.: dados do recebimento em Contas a Receber). */
  aposStatus?: ReactNode;
}

/** Modal "Nova/Editar Conta" de Contas a Pagar e Contas a Receber. */
export function ModalContaFinanceira<TIn extends FieldValues, TOut>({
  titulo,
  editando,
  form,
  formId,
  onSubmit,
  onFechar,
  finalidade,
  opcoesStatus,
  pessoa,
  aposStatus,
}: Readonly<ModalContaFinanceiraProps<TIn, TOut>>) {
  const planoContas = usePlanoContas({ search: '' });
  const opcoesPlanoContas = (planoContas.data?.data ?? []).map((pc) => ({
    valor: pc.id,
    rotulo: `${pc.codigo} - ${pc.nome}`,
  }));

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={titulo}
      rodape={
        <FormAcoes
          form={form}
          formId={formId}
          rotuloEnviar={editando ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={formId}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          const resultado = await onSubmit(valores);
          if (resultado === false) return;
          onFechar();
        }}
      >
        <FormField name="descricao" label="Descrição" obrigatorio className="sm:col-span-2" />
        {pessoa}
        <FormField name="valor" label="Valor" tipo="moeda" obrigatorio />
        <FormField name="dataVencimento" label="Data de Vencimento" tipo="data" obrigatorio />
        <FormField
          name="formaPagamentoId"
          label="Forma de Pagamento"
          tipo="entidade"
          entidade="formas-pagamento"
          filtros={{ finalidade }}
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
        <FormField name="status" label="Status" tipo="select" opcoes={opcoesStatus} />
        {aposStatus}
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
