import {
  contaReceberInputSchema,
  type ContaReceber,
  type ContaReceberFormulario,
} from '@torres/shared';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOpcoesContasBancarias } from '../contas-bancarias/use-contas-bancarias';
import { ModalContaFinanceira } from '../contas-financeiras/ModalContaFinanceira';
import { valoresIniciaisContaFinanceira } from '../contas-financeiras/valores-iniciais';
import { OPCOES_STATUS } from './opcoes';
import { useCriarContaReceber, useEditarContaReceber } from './use-contas-receber';

function valoresIniciais(conta?: ContaReceber): ContaReceberFormulario {
  return {
    ...valoresIniciaisContaFinanceira(conta),
    pacienteId: conta?.pacienteId ?? null,
    profissionalSacadoId: conta?.profissionalSacadoId ?? null,
    competencia: conta?.competencia ?? '',
    // Parcial é calculado pelas baixas: no modal a conta aparece como A vencer e a API recalcula.
    status:
      conta?.status === 'RECEBIDO' || conta?.status === 'CANCELADO' ? conta.status : 'PENDENTE',
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

/** Competência (mês/ano) da conta, base do relatório de provisão. Vazia: o mês do vencimento. */
function CampoCompetencia() {
  const { t } = useTranslation();
  const { control } = useFormContext<ContaReceberFormulario>();
  return (
    <Controller
      control={control}
      name="competencia"
      render={({ field }) => (
        <div className="grid content-start gap-2">
          <Label htmlFor="competencia">{t('contasReceber.campos.competencia')}</Label>
          <Input
            id="competencia"
            type="month"
            value={field.value ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
          />
          <p className="text-xs text-muted-foreground">
            {t('contasReceber.campos.competenciaAjuda')}
          </p>
        </div>
      )}
    />
  );
}

export interface ModalContaReceberProps {
  /** Sem conta: "Nova Conta a Receber". Com conta: "Editar Conta a Receber". */
  conta?: ContaReceber;
  onFechar: () => void;
}

/** Modal "Nova Conta a Receber" e "Editar Conta a Receber" (`/receber`). */
export function ModalContaReceber({ conta, onFechar }: Readonly<ModalContaReceberProps>) {
  const { t } = useTranslation();
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
        <>
          <FormField
            name="pacienteId"
            label="Cliente"
            tipo="entidade"
            entidade="pacientes"
            placeholder="Buscar cliente (nome, telefone)..."
          />
          <FormField
            name="profissionalSacadoId"
            label={t('contasReceber.campos.profissional')}
            tipo="entidade"
            entidade="profissionais"
            placeholder={t('contasReceber.campos.profissionalPlaceholder')}
            descricao={t('contasReceber.campos.sacadoAjuda')}
          />
        </>
      }
      aposStatus={
        <>
          <CamposRecebimento />
          <CampoCompetencia />
        </>
      }
    />
  );
}
