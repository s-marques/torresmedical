import { baixarContaReceberSchema, type ContaReceber } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { useOpcoesContasBancarias } from '../contas-bancarias/use-contas-bancarias';
import { useBaixarContaReceber } from './use-contas-receber';

const ID_FORMULARIO = 'form-baixar-conta-receber';

export interface ModalBaixaContaReceberProps {
  conta: ContaReceber;
  onFechar: () => void;
}

/**
 * Modal "Baixar Conta a Receber": registra um recebimento, total ou parcial. O valor sugerido é o
 * saldo em aberto; menos que isso deixa a conta Parcial, e a soma das baixas no total leva a Pago.
 */
export function ModalBaixaContaReceber({ conta, onFechar }: Readonly<ModalBaixaContaReceberProps>) {
  const { t } = useTranslation();
  const baixar = useBaixarContaReceber(conta.id);
  const opcoesContas = useOpcoesContasBancarias();
  const saldo = Number(conta.saldo);
  const form = useFormulario(baixarContaReceberSchema, {
    defaultValues: {
      dataRecebimento: new Date().toISOString().slice(0, 10),
      valorRecebido: saldo,
      formaPagamentoId: null,
      contaBancariaId: null,
      documento: '',
      observacoes: '',
    },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('contasReceber.baixa.titulo')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('contasReceber.baixa.confirmar')}
          onCancelar={onFechar}
        />
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {t('contasReceber.baixa.descricao', { descricao: conta.descricao })}{' '}
        <strong className="text-foreground">
          {t('contasReceber.baixa.saldoEmAberto', { saldo: formatarMoeda(saldo) })}
        </strong>
      </p>
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await baixar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="dataRecebimento"
          label={t('contasReceber.baixa.dataRecebimento')}
          tipo="data"
          obrigatorio
        />
        <FormField
          name="valorRecebido"
          label={t('contasReceber.baixa.valorRecebido')}
          tipo="moeda"
          obrigatorio
          descricao={t('contasReceber.baixa.valorAjuda')}
        />
        <FormField
          name="formaPagamentoId"
          label={t('contasReceber.baixa.formaPagamento')}
          tipo="entidade"
          entidade="formas-pagamento"
          filtros={{ finalidade: 'receber' }}
          placeholder={t('contasReceber.baixa.selecione')}
        />
        <FormField
          name="contaBancariaId"
          label={t('contasReceber.baixa.contaBancaria')}
          tipo="select"
          opcoes={opcoesContas}
          placeholder={t('contasReceber.baixa.selecione')}
        />
        <FormField
          name="documento"
          label={t('contasReceber.baixa.documento')}
          className="sm:col-span-2"
        />
        <FormField
          name="observacoes"
          label={t('contasReceber.baixa.observacoes')}
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
