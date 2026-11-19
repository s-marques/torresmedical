import {
  contaReceberInputSchema,
  type ContaReceber,
  type ContaReceberFormulario,
} from '@torres/shared';
import { useWatch } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { useOpcoesContasBancarias } from '../contas-bancarias/use-contas-bancarias';
import { ModalContaFinanceira } from '../contas-financeiras/ModalContaFinanceira';
import { valoresIniciaisContaFinanceira } from '../contas-financeiras/valores-iniciais';
import { OPCOES_STATUS } from './opcoes';
import { useCriarContaReceber, useEditarContaReceber } from './use-contas-receber';

function valoresIniciais(conta?: ContaReceber): ContaReceberFormulario {
  return {
    ...valoresIniciaisContaFinanceira(conta),
    pacienteId: conta?.pacienteId ?? null,
    status: conta?.status ?? 'PENDENTE',
    contaBancariaId: conta?.contaBancariaId ?? null,
    dataRecebimento: conta?.dataRecebimento ?? '',
  };
}

/**
 * Conta bancária e data do recebimento, só com status Recebido (decisão do dev na #46, para a
 * Conciliação). Sem data, a API grava a de hoje.
 */
export function CamposRecebimento() {
  const status = useWatch<ContaReceberFormulario, 'status'>({ name: 'status' });
  const opcoes = useOpcoesContasBancarias();
  if (status !== 'RECEBIDO') return null;
  return (
    <>
      <FormField
        name="contaBancariaId"
        label="Conta Bancária"
        tipo="select"
        opcoes={opcoes}
        placeholder="Selecione (opcional)"
      />
      <FormField
        name="dataRecebimento"
        label="Data de Recebimento"
        tipo="data"
        descricao="Vazia: a data de hoje."
      />
    </>
  );
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

  return (
    <ModalContaFinanceira
      titulo={conta ? 'Editar Conta a Receber' : 'Nova Conta a Receber'}
      editando={Boolean(conta)}
      form={form}
      formId="form-conta-receber"
      onSubmit={(valores) => (conta ? editar : criar).mutateAsync(valores)}
      onFechar={onFechar}
      finalidade="receber"
      opcoesStatus={OPCOES_STATUS}
      pessoa={
        <FormField
          name="pacienteId"
          label="Cliente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Buscar cliente (nome, telefone)..."
          className="sm:col-span-2"
        />
      }
      aposStatus={<CamposRecebimento />}
    />
  );
}
